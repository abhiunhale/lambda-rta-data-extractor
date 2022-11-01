const {SecretsManager} = require("aws-sdk");
let commonUtils = require('lambda-common-utils');

const logger = commonUtils.loggerUtils.getLogger;
const secretsManager = new SecretsManager();
secretsManager.constructor({apiVersion: '2017-10-17', region: process.env.AWS_REGION});
const getSecrets = async (SecretId) => {
    logger.log("Retrieving secrets for SecretId: " + SecretId)
    return new Promise((resolve, reject) => {
        secretsManager.getSecretValue({SecretId}, (err, result) => {
            if (err) {
                reject(err);
                logger.error('Error in fetching secrets :' + err.message);
            } else {
                resolve(JSON.parse(result.SecretString))
                logger.debug("Secrets : " + result.SecretString)
            }
        })
    })
}

module.exports = {
    getSecrets: getSecrets
};

