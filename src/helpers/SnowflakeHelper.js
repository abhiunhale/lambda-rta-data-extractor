const snowflake = require("snowflake-sdk");
const {queryParams} = require("../resources/queryParams");


async function fetchDataFromSnowflake(paramObject, snowflakeConnectionKeys) {
    let connection_ID;
    let responseRows;
    let sqlText;
    let tenantId = paramObject.tenantId;
    let schedulingUnitId;
    if (paramObject.schedulingUnits.length > 1) {
        schedulingUnitId = paramObject.schedulingUnits.map(d => `'${d}'`).join(',');
    } else {
        schedulingUnitId = '\'' + paramObject.schedulingUnits + '\'';
    }
    let userId;
    if (paramObject.userIds.length > 1) {
        userId = paramObject.userIds.map(d => `'${d}'`).join(',');
    } else {
        userId = '\'' + paramObject.userIds + '\'';
    }
    let suStartDate = paramObject.suStartDate;
    let suEndDate = paramObject.suEndDate;

    let connection = snowflake.createConnection({
        account: snowflakeConnectionKeys.account,
        username: snowflakeConnectionKeys.username,
        password: snowflakeConnectionKeys.password,
        application: "WFM-Extract-Service"
    });

    connection.connect(
        function (err, conn) {
            if (err) {
                logger.error('Unable to connect: ' + err.message);
            } else {
                logger.log('Successfully connected to Snowflake with ID: ' + conn.getId());
                connection_ID = conn.getId();
            }
        }
    );

    connection.execute({
        sqlText: 'USE WAREHOUSE REPORTS_WH;'
    });

    sqlText = queryParams.part1 + tenantId + queryParams.part2 + schedulingUnitId +
        queryParams.part3 + userId + queryParams.part4 + suStartDate +
        queryParams.part5 + suEndDate + queryParams.part6;

    await executeSFQuery(connection, sqlText, paramObject).then((response) => {
        responseRows = JSON.stringify(response);
        logger.log("response from execute sql : " + JSON.stringify(response));
    }).catch((error) => {
        logger.log("error in statement execution" + error);
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
                sqlText: sqlText,
                complete: function (err, stmt, rows) {
                    if (err) {
                        logger.info(`${stmt.getSqlText()} : ${err.code}`);
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
        }
    });
}

exports.fetchDataFromSnowflake = fetchDataFromSnowflake;
