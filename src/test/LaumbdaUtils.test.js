'use strict';

let sinon = require("sinon");
const rp = require('request-promise');
let LambdaUtils = require('../LambdaUtils.js');
let expect = require('chai').expect;

let stub;

describe('check performGetRequestToCXone', function () {

    this.timeout(15000);
    let localSelf;

    beforeEach(function(){
        stub = sinon.stub(rp, 'Request').resolves({});
    });

    afterEach(function(){
        stub.restore();
    });

    it('check performGetRequestToCXone pass', async() => {
        try {
            await LambdaUtils.performGetRequestToCXone('/path', 'tenant', 'token', 'https://host');
            expect(true);
        } catch(err) {
            expect(false);
        }

        try {
            await LambdaUtils.performGetRequestToCXone('/path', 'tenant', 'token', '');
            expect(false);
        } catch(err) {
            expect(true);
        }

        process.env.HOST='https://host';
        try {
            await LambdaUtils.performGetRequestToCXone('/path', 'tenant', 'token', '');
            expect(true);
        } catch(err) {
            expect(false);
        }
    });

    it('check performGetRequestToCXone missing path', async() => {
        try {
            await LambdaUtils.performGetRequestToCXone('', 'tenant', 'token', 'https://host');
            expect(false);
        } catch(err) {
            expect(true);
        }
    });

    it('check performGetRequestToCXone missing tenant', async() => {
        try {
            await LambdaUtils.performGetRequestToCXone('/path', '', 'token', 'https://host');
            expect(false);
        } catch(err) {
            expect(true);
        }
    });

    it('check performGetRequestToCXonem missing token', async() => {
        try {
            await LambdaUtils.performGetRequestToCXone('/path', 'tenant', '', 'https://host');
            expect(false);
        } catch(err) {
            expect(true);
        }
    });

    it('check performGetRequestToCXone missing host', async() => {
        try {
            await LambdaUtils.performGetRequestToCXone('/path', 'tenant', 'token', '');
            expect(false);
        } catch(err) {
            expect(true);
        }
    });

    it('check performGetRequestToCXone throw error', async() => {
        try {
            stub.restore();
            stub = sinon.stub(rp, 'Request').rejects({err: 'err'});
            await LambdaUtils.performGetRequestToCXone('/path', 'tenant', 'token', 'https://host');
            expect(false);
        } catch(err) {
            expect(err.err).to.equal('err');
        }
    });
});