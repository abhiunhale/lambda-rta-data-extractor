'use strict';

let AWS = require('aws-sdk');
let snowflake = require('snowflake-sdk');
const { Parser } = require('json2csv');
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
        queries.forEach(function (query) {
            if (query.filterName === 'schedulingId') {
                let values = query.values;
                values.forEach(function (value) {
                    schedulingUnitIds.push(value.key);
                });
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
        if (schemaName === 'wfo_master' && (process.env.AWS_PROFILE === "dev") || process.env.AWS_PROFILE === "test")
            schemaName = "perm_lambda_IT";
        return schemaName;
    };

    self.getTenantId = function () {
        return tenant.tenantId;
    };

    self.fetchDataFromSnowflake = async function (paramObject) {
        let connection_ID;
        let responseRows;
        let sqlText;
        let tenantId = paramObject.tenantId;
        let schedulingUnitId = paramObject.schedulingUnits.map(d => `'${d}'`).join(',');
        let userId = paramObject.userIds.map(d => `'${d}'`).join(',');
        let suStartDate = paramObject.suStartDate;
        let suEndDate = paramObject.suEndDate;

        let connection = snowflake.createConnection({
            account: "cxone_na1_dev",
            username: "WFM_DATA_EXTRACT_MS",
            password: "gICW#U48xm46JJzA",
            application: "WFM-Extract-Service"
        });

        connection.connect(
            function (err, conn) {
                if (err) {
                    console.error('Unable to connect: ' + err.message);
                } else {
                    console.log('Successfully connected to Snowflake.');
                    // Optional: store the connection ID.
                    connection_ID = conn.getId();
                }
            }
        );

        connection.execute({
            sqlText: 'USE WAREHOUSE REPORTS_WH;'
        });

        sqlText = "select concat(userDim.USER_FIRST_NAME,' ',userDim.USER_LAST_NAME) as agent , SUSCD.SCHEDULING_UNIT_TIMEZONE as time_zone , adherence_fact.PUBLISHED_FLAG , SUSCD.SCHEDULING_UNIT_NAME , adherence_fact.SU_START_DATE_ID as From_date , adherence_fact.SU_START_TIME_ID as From_time , adherence_fact.SU_END_DATE_ID as To_date , adherence_fact.SU_END_TIME_ID as to_time , activityDim.ACTIVITY_NAME as Scheduled_activity , agentActivity.WFM_AGENT_STATE_NAME as actual_activity , adherence_fact.IN_ADHERENCE_SECONDS as in_adherence , adherence_fact.OUT_OF_ADHERENCE_SECONDS as out_adherence from ( select USER_ID , SCHEDULING_UNIT_ID , SCHEDULED_ACTIVITY_ID , ACTUAL_WFM_AGENT_STATE_ID , to_varchar(SU_START_DATE_ID::date, \'mon dd, yyyy\') as SU_START_DATE_ID , SU_START_TIME_ID , to_varchar(SU_END_DATE_ID::date, \'mon dd, yyyy\') as SU_END_DATE_ID , SU_END_TIME_ID , TO_TIME(TO_TIMESTAMP_NTZ(IN_ADHERENCE_SECONDS)) AS IN_ADHERENCE_SECONDS , TO_TIME(TO_TIMESTAMP_NTZ(OUT_OF_ADHERENCE_SECONDS)) AS OUT_OF_ADHERENCE_SECONDS, PUBLISHED_FLAG , _tenant_id from DATAHUB.WFM_REFINED.ADHERENCE_DETAIL_FACT where _tenant_id = '"+tenantId+"' and SCHEDULING_UNIT_ID in ("+schedulingUnitId+") and USER_ID in ("+userId+") and SU_START_DATE_ID >= '"+suStartDate+"' and SU_END_DATE_ID <= '"+suEndDate+"' ) as adherence_fact inner join DATAHUB.USERHUB_REFINED.USER_SCD_DIM userDim on userDim.USER_ID = adherence_fact.USER_ID and userDim._tenant_id = adherence_fact._tenant_id and userDim.CURRENT_FLAG = true inner join DATAHUB.WFM_REFINED.SCHEDULING_UNIT_SCD_DIM SUSCD on SUSCD.SCHEDULING_UNIT_ID = adherence_fact.SCHEDULING_UNIT_ID and suscd._tenant_id = adherence_fact._tenant_id and suscd.CURRENT_FLAG = true inner join DATAHUB.WFM_REFINED.ACTIVITY_DIM activityDim on activityDim.ACTIVITY_ID = adherence_fact.SCHEDULED_ACTIVITY_ID and activityDim._tenant_id = adherence_fact._tenant_id inner join DATAHUB.WFM_REFINED.WFM_AGENT_STATE_SCD_DIM agentActivity on agentActivity.WFM_AGENT_STATE_ID = adherence_fact.ACTUAL_WFM_AGENT_STATE_ID and agentActivity._tenant_id = adherence_fact._tenant_id and agentActivity.CURRENT_FLAG = true";

        await self.checkRecords(connection, sqlText, paramObject).then((response) => {
            responseRows = JSON.parse(response);
            logger.log("response from execute sql : " + JSON.stringify(response));
        }).catch((error) => {
            logger.log("error in statement execution" + error);
        });

        connection.destroy(function(err, conn) {
            if (err) {
                console.error('Unable to disconnect: ' + err.message);
            } else {
                console.log('Disconnected connection with id: ' + connection.getId());
            }
        });

        return responseRows;

    };

    self.checkRecords = async function (conn, sqlText) {
        return new Promise((resolve, reject) => {
            try {
                conn.execute({
                    sqlText: sqlText,
                    complete: function (err, stmt, rows) {
                        if (err) {
                            logger.info(`${stmt.getSqlText()} : ${err.code}`);
                            reject(0);
                        }else{
                            resolve(rows);
                        }
                    }
                });
            } catch (err) {
                error(err);
            }
        });
    }

    self.convertSFRowsToCSV = function(data){
        let jsonRows = JSON.parse(data);
        let fields = [
            {label: 'Agent', value: 'AGENT'},
            {label: 'Time Zone', value: 'TIME_ZONE'},
            {label: 'Published Schedule', value: 'PUBLISHED_FLAG'},
            {label: 'Scheduling Unit', value: 'SCHEDULING_UNIT_NAME'},
            {label: 'From (Date)', value: 'FROM_DATE'},
            {label: 'From (Time)', value: 'FROM_TIME'},
            {label: 'From (Time)', value: 'TO_DATE'},
            {label: 'To (Time)', value: 'TO_TIME'},
            {label: 'Scheduled Activity', value: 'SCHEDULED_ACTIVITY'},
            {label: 'Actual Activity', value: 'ACTUAL_ACTIVITY'},
            {label: 'In Adherence', value: 'IN_ADHERENCE'},
            {label: 'Out of Adherence', value: 'OUT_ADHERENCE'}
        ];

        let json2csvParser = new Parser({ fields });
        let csv = json2csvParser.parse(myCars);

        return csv;
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

        logger.info('4. VERIFY REQUEST BODY FOR FILTERS');
        let isEventValid = executor.verifyEvent();
        if (!isEventValid) {
            logger.error(constants.INVALID_REQUEST);
            callback(constants.BAD_REQUEST);
        }

        logger.info('5. GET LIST OF USER IDs');
        let userIds = await executor.getUsersFromUH();

        // SF data fetch
        logger.info('Fetch data from SF');
        fetchDataSFObject['tenantId'] = executor.getTenantId();
        fetchDataSFObject['schedulingUnits'] = executor.getSchedulingUnits();
        fetchDataSFObject['userIds'] = userIds;
        fetchDataSFObject['suStartDate'] = event.body.reportDateRange.from;
        fetchDataSFObject['suEndDate'] = event.body.reportDateRange.to;
        let resultRows = await executor.fetchDataFromSnowflake(fetchDataSFObject);
        console.log('Result is :' + resultRows);

        logger.info('6. GENERATE NAME FOR CSV FILE');
        let filename = executor.generateFileName();
        logger.info('FILE NAME :'+filename);
        logger.info('7. UPLOAD FILE TO S3');
        let resdd = [
            {
                "AGENT": "Mars134 Demo1",
                "TIME_ZONE": "America/New_York",
                "PUBLISHED_FLAG": true,
                "SCHEDULING_UNIT_NAME": "perm_mars_demo",
                "FROM_DATE": "Apr 04, 2020",
                "FROM_TIME": "00:00:00",
                "TO_DATE": "Apr 04, 2020",
                "TO_TIME": "23:59:00",
                "SCHEDULED_ACTIVITY": "Unpaid Time Off",
                "ACTUAL_ACTIVITY": "Unknown",
                "IN_ADHERENCE": "23:59:59",
                "OUT_ADHERENCE": "00:00:00"
            },
            {
                "AGENT": "Mars134 Demo1",
                "TIME_ZONE": "America/New_York",
                "PUBLISHED_FLAG": true,
                "SCHEDULING_UNIT_NAME": "perm_mars_demo",
                "FROM_DATE": "Apr 03, 2020",
                "FROM_TIME": "00:00:00",
                "TO_DATE": "Apr 03, 2020",
                "TO_TIME": "23:59:00",
                "SCHEDULED_ACTIVITY": "Unpaid Time Off",
                "ACTUAL_ACTIVITY": "Unknown",
                "IN_ADHERENCE": "23:59:59",
                "OUT_ADHERENCE": "00:00:00"
            },
            {
                "AGENT": "Mars134 Demo1",
                "TIME_ZONE": "America/New_York",
                "PUBLISHED_FLAG": true,
                "SCHEDULING_UNIT_NAME": "perm_mars_demo",
                "FROM_DATE": "Apr 02, 2020",
                "FROM_TIME": "00:00:00",
                "TO_DATE": "Apr 02, 2020",
                "TO_TIME": "23:59:00",
                "SCHEDULED_ACTIVITY": "Unpaid Time Off",
                "ACTUAL_ACTIVITY": "Unknown",
                "IN_ADHERENCE": "23:59:59",
                "OUT_ADHERENCE": "00:00:00"
            },
            {
                "AGENT": "Mars134 Demo1",
                "TIME_ZONE": "America/New_York",
                "PUBLISHED_FLAG": true,
                "SCHEDULING_UNIT_NAME": "perm_mars_demo",
                "FROM_DATE": "Apr 01, 2020",
                "FROM_TIME": "00:00:00",
                "TO_DATE": "Apr 01, 2020",
                "TO_TIME": "23:59:00",
                "SCHEDULED_ACTIVITY": "Unpaid Time Off",
                "ACTUAL_ACTIVITY": "Unknown",
                "IN_ADHERENCE": "23:59:59",
                "OUT_ADHERENCE": "00:00:00"
            },
            {
                "AGENT": "Mars134 Demo1",
                "TIME_ZONE": "America/New_York",
                "PUBLISHED_FLAG": true,
                "SCHEDULING_UNIT_NAME": "perm_mars_demo",
                "FROM_DATE": "Apr 05, 2020",
                "FROM_TIME": "00:00:00",
                "TO_DATE": "Apr 05, 2020",
                "TO_TIME": "23:59:00",
                "SCHEDULED_ACTIVITY": "Unpaid Time Off",
                "ACTUAL_ACTIVITY": "Unknown",
                "IN_ADHERENCE": "23:59:59",
                "OUT_ADHERENCE": "00:00:00"
            }
        ];
        let csvData = executor.convertSFRowsToCSV(resdd);
        logger.info('CSV '+csvData);


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