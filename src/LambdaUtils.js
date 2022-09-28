'use strict';
let commonUtils = require('lambda-common-utils');
let request = require('request-promise');

const logger = commonUtils.loggerUtils.getLogger;

function performGetRequestToCXone(path, tenant, token, host, isUserHubApi) {
    return new Promise((resolve, reject) => {
        if (process.env.HOST) {
            host = process.env.HOST;
        }

        let params = buildGetRequest(path, token, tenant, host, isUserHubApi);
        console.log("is user hub api:", isUserHubApi);
        console.log( "show params: ", params);
        logger.debug(`About to send GET request to CXone with params: ${JSON.stringify(params)}`);
        if (params) {
            request(params).then((response) => {
                resolve(response);
            }).catch((error) => {
                logger.error(error);
                reject(error);
            });
        } else {
            reject(`Failed to build GET request for path: ${path} and tenant: ${tenant} and token: ${token}`);
        }
    })
}

function buildGetRequest(path, token, tenant, host, isUserHubApi) {

    if (!host) {
        logger.error("HOST environment variable is missing!");
        return;
    }

    if (!path || !token || !tenant) {
        logger.error("Missing essential input: host, path, token, tenant or json");
        return;
    }

    let params = {
                    method: 'GET',
                    uri: host + path,
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json',
                        'tenant': tenant
                    }
                };

    if (isUserHubApi){
        params.headers["Originating-Service-Identifier"] = 'lambda-wfm-snowflake-data-export';
    }
    return params;
}

exports.performGetRequestToCXone = performGetRequestToCXone;
exports.buildGetRequest = buildGetRequest;
exports.getLogger = commonUtils.loggerUtils.getLogger;
