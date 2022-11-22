'use strict';

let AWS = require('aws-sdk');
let snowflake = require('snowflake-sdk');
const {Parser} = require('json2csv');
const getStream = require('get-stream');
const fs = require('fs');
const path = require('path');
const {parse} = require('csv-parse');
let moment = require('moment');
let LambdaUtils = require('./LambdaUtils.js');
let commonUtils = require('lambda-common-utils');
const logger = commonUtils.loggerUtils.getLogger;
let constantUtils = require("./ConstantUtils");
const {queryParams} = require("./resources/queryParams");
let secretsManager = require('./helpers/SecretsManagerHelper');
let snowflakeHelper = require('./helpers/SnowflakeHelper');
const constants = constantUtils.getConstants;

function Executor(event, token) {

    let self = this;
    let host = process.env.SERVICE_URL;
    let data_lake_bucket = process.env.DATALAKE_BUCKET;
    let tenant = {};
    let isFTOn = false;
    let s3 = new AWS.S3({
        apiVersion: "2012-10-17"
    });
    let snowflakeConnectionKeys = {};

    self.verifyFeatureToggleIsOn = async function () {
        await LambdaUtils.performGetRequestToCXone(constants.CHECK_FT_STATUS_API + constants.EXPORT_FT, token, host, true, tenant.schemaName).then((response) => {
            logger.log("Response of FT API:" + response + "for tenant:" + tenant.schemaName);
            isFTOn = JSON.parse(response);
        }).catch((error) => {
            logger.log("FT API failure for tenant:" + tenant.schemaName);
            throw new Error(JSON.stringify(error));
        });
        return isFTOn;
    };

    self.authenticateRequest = async function () {
        await LambdaUtils.performGetRequestToCXone(constants.CURRENT_API, token, host, true, self.getTenantSchemaName()).then((response) => {
            tenant = JSON.parse(response).tenant;
            logger.log("Successfully authenticated tenant : " + tenant.schemaName);
        }).catch((error) => {
            commonUtils.metricsWriter.addTenantMetricWithDimension(tenant, `LMBD-WFM-export-failures-D:reason`, 'getTenantSchemaName', 1);
            commonUtils.metricsWriter.flushAggregatedMetrics();
            throw new Error(JSON.stringify(error));
        });
    };

    self.verifyWFMLicense = function () {
        logger.log("tenant for license verification : " + tenant.schemaName);
        if (tenant && tenant.licenses && tenant.licenses.length > 0) {
            let licenseLen = tenant.licenses.length;
            for (let i = 0; i < licenseLen; i += 1) {
                if (tenant.licenses[i].applicationId === "WFM") {
                    logger.log("Successfully verified WFM license for tenant: " + tenant.schemaName);
                    return true;
                }
            }
            return false;
        }
        return false;
    };

    self.verifyEvent = function () {
        logger.info("event verification for the tenant:" + tenant.schemaName);
        logger.debug("event for verification: " + JSON.stringify(event));
        if (!event || !event.reportName || event.reportName !== "adherenceV2") {
            logger.info("event verification FAILED due to invalid report name");
            return false;
        }
        if (!event.reportDateRange || !event.reportDateRange.from || !event.reportDateRange.to) {
            logger.info("event verification FAILED due to invalid report date range");
            return false;
        }
        if (!event.query || event.query.length <= 0) {
            logger.info("event verification FAILED due to invalid query");
            return false;
        }
        return true;
    };

    self.getUsersFromUH = async function () {
        let userIds = [];
        await LambdaUtils.performGetRequestToCXone(constants.USER_HUB_API, token, host, true, tenant.schemaName).then((response) => {
            let users = JSON.parse(response).users;
            logger.info("response received from userhub api :" + users.length);
            users.forEach(function (user) {
                userIds.push(user.id);
            });
        }).catch((error) => {
            throw new Error(JSON.stringify(error));
        });
        return userIds;
    };

    self.getSchedulingUnits = function () {
        let schedulingUnitIds = [];
        let queries = event.query;
        queries.every(function (query) {
            if (query.filterName === 'schedulingId') {
                let values = query.values;
                values.forEach(function (value) {
                    schedulingUnitIds.push(value.key);
                });
                return false;
            }
        });
        return schedulingUnitIds;
    };

    self.generateFileName = function () {
        //sample file name : 20221007155945_pm.kepler.administrator@wfosaas.com.csv
        let decoded_token = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        let fileName;
        let currentTime = moment(new Date()).format("yyyyMMDDHHmmss");
        fileName = currentTime + "_" + decoded_token.name + ".csv";
        return fileName;
    };

    self.saveAdherenceFileToS3 = async function (filename, data) {
        logger.debug("bucket used for upload" + (data_lake_bucket));
        //s3 path : dev-datalake-cluster-bucket-q37evqefmksl/report/export/perm_pm_kepler/adherence/
        let s3FileParams = {
            Bucket: data_lake_bucket,
            Key: "report/export/" + tenant.schemaName + "/adherence/" + filename,
            Body: data
        };
        let fileLocation = {};

        await s3.upload(s3FileParams).promise().then((response) => {
            logger.info("File upload response: " + JSON.stringify(response));
            fileLocation.Bucket = response.Bucket;
            fileLocation.Key = response.Key;
        }).catch((error) => {
            console.log(error);
            throw new Error(JSON.stringify(error));
        });
        return fileLocation;
    };

    self.getS3SignedURL = function (fileLocation) {
        fileLocation.Expires = constants.EXPIRATION_TIME_MILLISECONDS;
        return s3.getSignedUrl('getObject', fileLocation);
    };

    self.getTenantSchemaName = function () {
        let decoded_token = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        let schemaName = decoded_token.tenant;
        if (schemaName === 'wfo_master' && (process.env.AWS_PROFILE === "dev" || process.env.AWS_PROFILE === "test"))
            schemaName = "perm_lambda_IT";
        return schemaName;
    };

    self.getTenantId = function () {
        return tenant.tenantId;
    };

    self.getConnectionDetails = function () {
        return snowflakeConnectionKeys;
    }

    self.convertSFResultToCSV = function (data) {
        let jsonRows = data;
        let fields = [
            {label: 'Agent', value: 'AGENT'},
            {label: 'Time Zone', value: 'TIME_ZONE'},
            {label: 'Published Schedule', value: 'PUBLISHED_FLAG'},
            {label: 'Scheduling Unit', value: 'SCHEDULING_UNIT_NAME'},
            {label: 'From (Date)', value: 'FROM_DATE'},
            {label: 'From (Time)', value: 'FROM_TIME'},
            {label: 'To (Date)', value: 'TO_DATE'},
            {label: 'To (Time)', value: 'TO_TIME'},
            {label: 'Scheduled Activity', value: 'SCHEDULED_ACTIVITY'},
            {label: 'Actual Activity', value: 'ACTUAL_ACTIVITY'},
            {label: 'In Adherence', value: 'IN_ADHERENCE'},
            {label: 'Out of Adherence', value: 'OUT_ADHERENCE'}
        ];

        if (jsonRows === 0) {
            let response = "";
            fields.forEach(function (field) {
                response = response + ',' + field.label;
            });
            return response.substring(1, response.length);
        }
        let json2csvParser = new Parser({fields});

        return json2csvParser.parse(jsonRows);
    };

    self.getSFUserNameAndPassword = async () => {
        try {
            if (Object.keys(snowflakeConnectionKeys).length === 0) {
                snowflakeConnectionKeys = await secretsManager.getSecrets(process.env.WFM_SNOWFLAKE_USER_SECRET);
                logger.debug("Connection keys: " + JSON.stringify(snowflakeConnectionKeys));
                logger.info("Connection keys retrieved successfully " + Object.keys(snowflakeConnectionKeys).length);
            }
        } catch (e) {
            logger.error(`Not able to get connection keys, Error: ${JSON.stringify(e)}`);
            throw new Error(JSON.stringify(error));
        }
    };

}

exports.Executor = Executor;

/**
 * Lambda to extract WFM data from Snowflake DL
 */

exports.handler = async (event, context, callback) => {
    commonUtils.loggerUtils.setDebugMode(process.env.DEBUG);
    logger.log("event:" + JSON.stringify(event));
    let hasWFMLicense = false;
    let token = "";
    let fetchDataSFObject = {};

    logger.info('0. BEGIN HANDLER AND VERIFY HOST/TOKEN');
    if (event.headers && event.headers.Authorization && event.headers.Authorization.indexOf("Bearer ") === 0) {
        logger.log("Headers verified successfully");
        token = event.headers.Authorization.split(" ")[1];
    } else {
        logger.error(constants.INVALID_TOKEN + ": " + event.headers.Authorization);
        callback(constants.BAD_REQUEST);
    }
    let executor = new Executor(event.body, token);
    commonUtils.loggerUtils.setDebugMode(process.env.DEBUG, executor.getTenantSchemaName());
    if (!process.env.SERVICE_URL) {
        logger.error('Fail to validate host from process :' + process.env.SERVICE_URL);
        callback(constants.INTERNAL_ERROR);
    }

    try {
        logger.info('1. AUTHENTICATE REQUEST');
        await executor.authenticateRequest();

        logger.info('2. VERIFY WFM LICENSE');
        hasWFMLicense = executor.verifyWFMLicense();
        if (!hasWFMLicense) {
            logger.error(constants.LICENSE_ERROR);
            callback(constants.INTERNAL_ERROR);
        }

        logger.info('3. Verify Feature Toggle');
        let isFTOn = await executor.verifyFeatureToggleIsOn();
        if (!isFTOn) {
            logger.error(constants.FT_ERROR);
            callback(constants.INTERNAL_ERROR);
        }

        logger.info('4. VERIFY REQUEST BODY FOR  FILTERS');
        let isEventValid = executor.verifyEvent();
        if (!isEventValid) {
            logger.error(constants.INVALID_REQUEST);
            callback(constants.BAD_REQUEST);
        }

        logger.info('5. GET LIST OF USER IDs');
        let userIds = await executor.getUsersFromUH();

        logger.info('6. FETCH DATA FROM SF.');
        await executor.getSFUserNameAndPassword();
        fetchDataSFObject['tenantId'] = executor.getTenantId();
        fetchDataSFObject['schedulingUnits'] = executor.getSchedulingUnits();
        fetchDataSFObject['userIds'] = userIds;
        fetchDataSFObject['suStartDate'] = event.body.reportDateRange.from;
        fetchDataSFObject['suEndDate'] = event.body.reportDateRange.to;
        fetchDataSFObject['tenantSchemaName'] = executor.getTenantSchemaName();
        let resultRows = await snowflakeHelper.fetchDataFromSnowflake(fetchDataSFObject, executor.getConnectionDetails());

        logger.info('7. GENERATE NAME FOR CSV FILE');
        let filename = executor.generateFileName();

        logger.info('8. UPLOAD FILE TO S3');
        let csvData = executor.convertSFResultToCSV(JSON.parse(resultRows));
        let fileLocation = await executor.saveAdherenceFileToS3(filename, csvData);

        logger.info('9.GET S3 PRESIGNED URL');
        let url = executor.getS3SignedURL(fileLocation);
        logger.info("URL:" + url);
        callback(null, {"url": url});
    } catch (error) {
        logger.error(constants.API_FAILURE + ": " + error);
        callback(constants.INTERNAL_ERROR);
    }
};