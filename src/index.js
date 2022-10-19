'use strict';

let AWS = require('aws-sdk');
const getStream = require('get-stream');
const fs = require('fs');
const path = require('path');
const {parse} = require('csv-parse');
let moment = require('moment');
let LambdaUtils = require('./LambdaUtils.js');
let commonUtils = require('lambda-common-utils');
const logger = commonUtils.loggerUtils.getLogger;
let constantUtils = require("./ConstantUtils");
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

    self.verifyFeatureToggleIsOn = async function () {
        await LambdaUtils.performGetRequestToCXone(constants.CHECK_FT_STATUS_API + constants.EXPORT_FT, token, host, true, tenant.schemaName).then((response) => {
            isFTOn = JSON.parse(response);
        }).catch((error) => {
            throw new Error(JSON.stringify(error));
        });
        return isFTOn;
    };

    self.authenticateRequest = async function () {
        await LambdaUtils.performGetRequestToCXone(constants.CURRENT_API, token, host, false).then((response) => {
            tenant = JSON.parse(response).tenant;
            logger.debug("tenant details: " + JSON.stringify(tenant));
        }).catch((error) => {
            commonUtils.metricsWriter.addTenantMetricWithDimension(tenant, `LMBD-WFM-export-failures-D:reason`, 'getTenant', 1);
            commonUtils.metricsWriter.flushAggregatedMetrics();
            throw new Error(JSON.stringify(error));
        });
    };

    self.verifyWFMLicense = function () {
        logger.debug("tenant for license verification : " + JSON.stringify(tenant));
        if (tenant && tenant.licenses && tenant.licenses.length > 0) {
            let licenseLen = tenant.licenses.length;
            for (let i = 0; i < licenseLen; i += 1) {
                if (tenant.licenses[i].applicationId === "WFM") {
                    return true;
                }
            }
            return false;
        }
        return false;
    };

    self.verifyEvent = function () {
        logger.debug("event for verification in executor: " + JSON.stringify(event));
        if (!event || !event.reportName || event.reportName !== "adherenceV2") {
            return false;
        }
        if (!event.reportDateRange || !event.reportDateRange.from || !event.reportDateRange.to) {
            return false;
        }
        return !(!event.query || event.query.length <= 0);
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

    self.getTenant = function () {
        let decoded_token = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return decoded_token.tenant;
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
    let data;

    logger.info('0. BEGIN HANDLER AND VERIFY HOST/TOKEN');
    if (event.headers.Authorization && event.headers.Authorization.startsWith("Bearer ")) {
        token = event.headers.Authorization.split(" ")[1];
    } else {
        logger.error(constants.INVALID_TOKEN + ": " + event.headers.Authorization);
        callback(constants.BAD_REQUEST);
    }
    let executor = new Executor(event.body, token);
    commonUtils.loggerUtils.setDebugMode(process.env.DEBUG, executor.getTenant());
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

        logger.info('4. VERIFY REQUEST BODY FOR FILTERS');
        let isEventValid = executor.verifyEvent();
        if (!isEventValid) {
            logger.error(constants.INVALID_REQUEST);
            callback(constants.BAD_REQUEST);
        }

        logger.info('5. GET LIST OF USER IDs');
        let userIds = await executor.getUsersFromUH();

        logger.info('6. GENERATE NAME FOR CSV FILE');
        let filename = executor.generateFileName();

        logger.info('7. UPLOAD FILE TO S3');
        const parseStream = parse({delimiter: ","});
        data = await getStream.array(fs.createReadStream(path.join(__dirname, "./test/mocks/mockAdherence.csv")).pipe(parseStream));
        data = data.map(line => line.join(',')).join('\n');

        let fileLocation = await executor.saveAdherenceFileToS3(filename, data);

        logger.info('8.GET S3 PRESIGNED URL');
        let url = executor.getS3SignedURL(fileLocation);
        logger.info("URL:" + url);
        callback(null, {"url": url});
    } catch (error) {
        logger.error(constants.API_FAILURE + ": " + error);
        callback(constants.INTERNAL_ERROR);
    }
};