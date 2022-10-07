'use strict';

let request = require('request');
let AWS = require('aws-sdk');
let moment = require('moment');
let Promise = require("bluebird");
Promise.allSettled = require("promise.allsettled");
let sizeof = require('object-sizeof');
let LambdaUtils = require('./LambdaUtils.js');
let commonUtils = require('lambda-common-utils');
const logger = commonUtils.loggerUtils.getLogger;
const USER_HUB_PATH="/user-management/v1/users";

function Executor(event, context) {

    let self = this;
    let host = process.env.SERVICE_URL;
    let token = event.evolveAuth.token;
    let tenant = {};

    self.authenticateRequest = async function () {
        logger.log('Step - Call TM for getting tenant IC details');
        await LambdaUtils.performGetRequestToCXone("/tenants/current?sensitive=true", token, host,false).then((response) => {
                tenant = JSON.parse(response).tenant;
                logger.log("tenant details: "+ JSON.stringify(tenant));
        }).catch((error) => {
            commonUtils.metricsWriter.addTenantMetricWithDimension(tenant, `LMBD-WFM-export-failures-D:reason`, 'getTenant', 1);
            commonUtils.metricsWriter.flushAggregatedMetrics();
            logger.error(JSON.stringify(error));
            throw new Error(JSON.stringify(error));
        });
    };

    self.verifyWFMLicense = function () {
        logger.log('Step - Verify WFM license from tenant details');
        logger.info("tenant for license verification : "+ JSON.stringify(tenant));
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
        logger.log('Step - Verify event details');
        logger.info("event for verification : "+ JSON.stringify(event));
        if (!event || !event.reportName || event.reportName !== "adherenceV2") {
            return false;
        }
        if (!event.reportDateRange || !event.reportDateRange.from || !event.reportDateRange.to) {
            return false;
        }
        if ( !event.query || event.query.length <= 0 ) {
            return false;
        }
        return true;
    };

    self.getUsersFromUH = async function() {
        let userIds = [];
        await LambdaUtils.performGetRequestToCXone(USER_HUB_PATH, token, host,true,tenant.schemaName).then((response) => {
            let users = JSON.parse(response).users;
            logger.info("response received from userhub api :"+ users.length);
            users.forEach(function (user) {
                userIds.push(user.id);
            });
        }).catch((error) => {
            logger.error("error in getting users from WFO" + error);
        });
        return userIds;
    };
}

exports.Executor = Executor;

/**
 * Lambda to extract WFM data from Snowflake DL
 */
exports.handler = async (event, context) => {
    let response = {};
    let hasWFMLicense = false;
    let executor = new Executor(event, context);
    let failureMessage = "Fail to extract WFM data";
    commonUtils.loggerUtils.setDebugMode(process.env.DEBUG);

    logger.log('1. BEGIN HANDLER AND VERIFY HOST');
    logger.info("event:"+ JSON.stringify(event));
    logger.info('host from process :' + process.env.SERVICE_URL);

    if (!process.env.SERVICE_URL || process.env.SERVICE_URL == null) {
        return context.fail("FAILED TO VALIDATE HOST");
    }

    try {
        logger.log('2. AUTHENTICATE REQUEST');
        await executor.authenticateRequest();

        logger.log('3. VERIFY WFM LICENSE');
        hasWFMLicense = executor.verifyWFMLicense();
        if(!hasWFMLicense) { return context.fail(failureMessage); }

        logger.log('4. VERIFY REQUEST BODY FOR FILTERS');
        let isEventValid = executor.verifyEvent();
        if(!isEventValid) { return context.fail(failureMessage); }

        logger.log('5. GET LIST OF USER IDs');
        let userIds = await executor.getUsersFromUH();

        logger.log('6. UPLOAD DATA TO S3');
    } catch (error) {
        return context.fail(error);
    }

    response = {
        statusCode: 200,
        message: "hello world"
    };
    return response;
};