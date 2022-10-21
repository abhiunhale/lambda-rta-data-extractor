'use strict';
let commonUtils = require('lambda-common-utils');
let request = require('request-promise');

const logger = commonUtils.loggerUtils.getLogger;

function performGetRequestToCXone(path, token, host, isUserHubApi, tenant) {
    return new Promise((resolve, reject) => {

        let params = buildGetRequest(path, token, host, isUserHubApi, tenant);
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
            reject(`Failed to build GET request for path: ${path} and token: ${token}`);
        }
    })
}

function buildGetRequest(path, token, host, isUserHubApi,tenant) {

    if (!path || !token ) {
        logger.error("Missing essential input: host, path, token, tenant or json");
        return;
    }

    let params = {
        method: 'GET',
        uri: host + path,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }
    };

    if (isUserHubApi){
        params.headers["Originating-Service-Identifier"] = 'lambda-wfm-snowflake-data-export';
        params.headers["tenant"]=tenant;
    }
    return params;
}

exports.performGetRequestToCXone = performGetRequestToCXone;
exports.buildGetRequest = buildGetRequest;
exports.getLogger = commonUtils.loggerUtils.getLogger;
