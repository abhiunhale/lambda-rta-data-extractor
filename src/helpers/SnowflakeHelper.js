const snowflake = require("snowflake-sdk");
const {queryParams} = require("../resources/queryParams");
let commonUtils = require('lambda-common-utils');
const constantUtils = require("../ConstantUtils");
const logger = commonUtils.loggerUtils.getLogger;
const constants = constantUtils.getConstants;
let tenantId, tenantSchemaName;

async function fetchDataFromSnowflake(paramObject, snowflakeConnectionKeys) {
    let responseRows;
    let sqlText;
    tenantId = paramObject.tenantId;
    let schedulingUnitId;
    let userId;
    if (paramObject.schedulingUnits.length > 1) {
        schedulingUnitId = paramObject.schedulingUnits.map(d => `'${d}'`).join(',');
    } else {
        schedulingUnitId = '\'' + paramObject.schedulingUnits + '\'';
    }
    if (paramObject.userIds.length > 1) {
        userId = paramObject.userIds.map(d => `'${d}'`).join(',');
    } else {
        userId = '\'' + paramObject.userIds + '\'';
    }
    let suStartDate = paramObject.suStartDate;
    let suEndDate = paramObject.suEndDate;
    tenantSchemaName = paramObject.tenantSchemaName;

    let connection = snowflake.createConnection({
        account: snowflakeConnectionKeys.account,
        username: snowflakeConnectionKeys.username,
        password: snowflakeConnectionKeys.password,
        application: constants.SF_APPLICATION
    });

    connection.connect(function (err, conn) {
        if (err) {
            logger.error('Unable to connect: ' + err.message);
        } else {
            logger.log('Successfully connected to Snowflake with ID: ' + conn.getId());
        }
    });

    let sqlTextUseWarehouse= "USE WAREHOUSE REPORTS_WH;";

    await executeSFQuery(connection, sqlTextUseWarehouse, paramObject).then((response) => {
        responseRows = JSON.stringify(response);
        logger.log("Tenant is: " + tenantSchemaName + ", Response from execute sql : " + JSON.stringify(response));
    }).catch((error) => {
        logger.log("Tenant is: " + tenantSchemaName + ", error in statement execution" + error);
    });

    sqlText = queryParams.part1 + tenantId + queryParams.part2 + schedulingUnitId + queryParams.part3 +
        userId + queryParams.part4 + suStartDate + queryParams.part5 + suEndDate + queryParams.part6;

    await executeSFQuery(connection, sqlText, paramObject).then((response) => {
        responseRows = JSON.stringify(response);
        logger.log("Tenant is: " + tenantSchemaName + ", Response from execute sql : " + JSON.stringify(response));
    }).catch((error) => {
        logger.log("Tenant is: " + tenantSchemaName + ", error in statement execution" + error);
    });

    connection.destroy(function (err, conn) {
        if (err) {
            logger.error('Unable to disconnect: ' + err.message);
        } else {
            logger.log('Disconnected connection with id: ' + connection.getId());
        }
    });

    return responseRows;

};

async function executeSFQuery(conn, sqlText) {
    return new Promise((resolve, reject) => {
        try {
            conn.execute({
                sqlText: sqlText, complete: function (err, stmt, rows) {
                    if (err) {
                        logger.error(`[Tenant is : ${tenantSchemaName}],  ${stmt.getSqlText()} : ${err.code}`);
                        reject(0);
                    } else {
                        if (rows.length > 1) {
                            resolve(rows);
                        } else {
                            logger.info(`${sqlText} No rows were returned.`);
                            resolve(0);
                        }
                    }
                }
            });
        } catch (err) {
            error(err);
            logger.error('Failed to execute SQL query for Tenant: ' + tenantSchemaName + ' , with error: ' + err.message);
        }
    });
}

exports.fetchDataFromSnowflake = fetchDataFromSnowflake;
