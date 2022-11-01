'use strict';

let snowflakeHelper = require('../helpers/SnowflakeHelper');
const constantUtils = require("../ConstantUtils");
let expect = require('chai').expect;
const constants = constantUtils.getConstants;

describe('check performGetRequestToCXone', function () {

    this.timeout(15000);

    let fetchDataSFObject = {
        tenantId: '11e72a4d-c24c-f040-aac3-0242ac110003',
        schedulingUnits: ['11e72a4d-c47b-41f0-aac3-0242xa110003'],
        userIds: ['11e72a4d-c481-3560-aac3-0242ac110003'],
        suStartDate: '2020-04-01',
        suEndDate: '2020-04-05'
    };

    let fetchDataSFObject1 = {
        tenantId: '11e72a4d-c24c-f040-aac3-0242ac110003',
        schedulingUnits: ['11e72a4d-c47b-41f0-aac3-0242xa110003', '11e72a4d-c47b-41f0-aac3-0242xa110003'],
        userIds: ['11e72a4d-c481-3560-aac3-0242ac110003', '11e72a4d-c47b-41f0-aac3-0242xa110003'],
        suStartDate: '2020-04-01',
        suEndDate: '2020-04-05'
    };

    let sfConn = {account: 'cxone_na1', username: 'WFM_DATA_EXTRACT_MS', password: 'gICWxm46JJzA'};

    it("Verify snowflake helper validations", async () => {
        let errorMsg = {err: constants.INVALID_TOKEN};
        await snowflakeHelper.fetchDataFromSnowflake(fetchDataSFObject, sfConn).catch(error => {
            expect(error.message).to.equal(JSON.stringify(errorMsg.err));
            done();
        });
    });

    it("Verify snowflake helper validations with data", async () => {
        let errorMsg = {err: constants.INVALID_TOKEN};
        await snowflakeHelper.fetchDataFromSnowflake(fetchDataSFObject1, sfConn).catch(error => {
            expect(error.message).to.equal(JSON.stringify(errorMsg.err));
            done();
        });
    });
});