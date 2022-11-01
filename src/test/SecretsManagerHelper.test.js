'use strict';

let expect = require('chai').expect;
let AWSMock = require('aws-sdk-mock');
const AWS = require("aws-sdk");
let secretsManagerStub = require('../helpers/SecretsManagerHelper');
const rp = require("request-promise");
const constantUtils = require("../ConstantUtils");
const constants = constantUtils.getConstants;


describe('check performGetRequestToCXone', function () {

    this.timeout(15000);

    beforeEach(function () {
        AWSMock.mock('SecretsManager', 'getSecretValue', (params, callback) => {
            let data = {account: 'cxone', username: 'WFM_DATA', password: 'gIC'};
            callback(null, data);
        });
    });

    afterEach(function () {
        AWSMock.restore();
    });

    it("Verify secret manager returns connection details : failure", async () => {
        let secretId = 'snowflake-user-secret';
        let errorMsg = {err: constants.CONFIG_ERROR};
        await secretsManagerStub.getSecrets(secretId).catch(error => {
            expect(error.message.toString()).to.equal(errorMsg.err);
        });
    });

});