'use strict';

let AWS = require('aws-sdk');
let moment = require('moment');
let Promise = require("bluebird");
Promise.allSettled = require("promise.allsettled");
let LambdaUtils = require('./LambdaUtils.js');
let commonUtils = require('lambda-common-utils');
const logger = commonUtils.loggerUtils.getLogger;
const USER_HUB_PATH = "/user-management/v1/users";

function Executor(event) {

    let self = this;
    let host = process.env.SERVICE_URL;
    let token = event.evolveAuth.token;
    let tenant = {};

    self.authenticateRequest = async function () {
        logger.info('Step - Call TM for getting tenant IC details');
        await LambdaUtils.performGetRequestToCXone("/tenants/current?sensitive=true", token, host, false).then((response) => {
            tenant = JSON.parse(response).tenant;
            logger.debug("tenant details: " + JSON.stringify(tenant));
        }).catch((error) => {
            commonUtils.metricsWriter.addTenantMetricWithDimension(tenant, `LMBD-WFM-export-failures-D:reason`, 'getTenant', 1);
            commonUtils.metricsWriter.flushAggregatedMetrics();
            logger.error(JSON.stringify(error));
            throw new Error(JSON.stringify(error));
        });
    };

    self.verifyWFMLicense = function () {
        logger.info('Step - Verify WFM license from tenant details');
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
        logger.info('Step - Verify event details');
        logger.info("event for verification : " + JSON.stringify(event));
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
        await LambdaUtils.performGetRequestToCXone(USER_HUB_PATH, token, host, true, tenant.schemaName).then((response) => {
            let users = JSON.parse(response).users;
            logger.info("response received from userhub api :" + users.length);
            users.forEach(function (user) {
                userIds.push(user.id);
            });
        }).catch((error) => {
            logger.error("error in getting users from WFO" + error);
        });
        return userIds;
    };

    self.generateFileName = function () {
        //sample file name : 20221007155945_pm.kepler.administrator@wfosaas.com.csv
        let fileName;
        let currentTime = moment(new Date()).format("yyyyMMDDHHmmss");
        fileName = currentTime + "_Adherence.json";
        return fileName;
    };

    self.saveAdherenceFileToS3 = async function (filename, data) {
        logger.info("Saving file to S3 for tenant " + tenant.schemaName);
        let s3 = new AWS.S3({
            apiVersion: "2012-10-17"
        });

        //s3 path : dev-datalake-cluster-bucket-q37evqefmksl/report/export/perm_pm_kepler/adherence/
        let s3FileParams = {
            Bucket: "rta-export-disha",
            Key: "report/export/" + tenant.schemaName + "/adherence1/" + filename,
            Body: JSON.stringify(data)
        };
        let fileLocation = "";

        await s3.upload(s3FileParams).promise().then((response) => {
            fileLocation = response.Location;
            logger.log("File uploaded successfully" + JSON.stringify(response));
        }).catch((error) => {
            logger.error("Fail to upload file " + error);
        });
        return fileLocation;
    };
}

exports.Executor = Executor;

/**
 * Lambda to extract WFM data from Snowflake DL
 */
exports.handler = async (event, context) => {
    logger.log("event:" + JSON.stringify(event));
    let response = {};
    let hasWFMLicense = false;
    let executor = new Executor(event);
    let failureMessage = "Fail to extract WFM data";
    commonUtils.loggerUtils.setDebugMode(process.env.DEBUG);

    logger.info('1. BEGIN HANDLER AND VERIFY HOST');
    logger.log('host from process :' + process.env.SERVICE_URL);

    if (!process.env.SERVICE_URL) {
        return context.fail("FAILED TO VALIDATE HOST");
    }

    try {
        logger.info('2. AUTHENTICATE REQUEST');
        await executor.authenticateRequest();

        logger.info('3. VERIFY WFM LICENSE');
        hasWFMLicense = executor.verifyWFMLicense();
        if (!hasWFMLicense) {
            return context.fail(failureMessage);
        }

        logger.info('4. VERIFY REQUEST BODY FOR FILTERS');
        let isEventValid = executor.verifyEvent();
        if (!isEventValid) {
            return context.fail(failureMessage);
        }

        logger.info('5. GET LIST OF USER IDs');
        let userIds = await executor.getUsersFromUH();

        logger.info('6. GENERATE NAME FOR CSV FILE');
        let filename = executor.generateFileName();
        logger.log("generated file name : " + filename);

        logger.info('7. UPLOAD FILE TO S3');
        let data = require('./test/mocks/mockAdherenceData.json');
        let fileLocation = await executor.saveAdherenceFileToS3(filename, data);
        logger.log("fileLocation:" + fileLocation);
        response = {
            statusCode: 200,
            location: fileLocation
        };
    } catch (error) {
        return context.fail(error);
    }

    return response;
};