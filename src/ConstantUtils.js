'use strict';

const exportConstant = {
    INVALID_TOKEN: "Invalid Authorization are provided",
    INVALID_HOST: "Failed to validate host",
    API_FAILURE: "Failure while calling API",
    LICENSE_ERROR: "Tenant does not have WFM license",
    FT_ERROR: "Export Feature toggle is disabled",
    INVALID_REQUEST: "Invalid filters in request",

    BAD_REQUEST: "Bad Request was provided",
    INTERNAL_ERROR: "Internal Server Error",

    CURRENT_API: "/tenants/current?sensitive=true",
    CHECK_FT_STATUS_API: "/config/toggledFeatures/check?featureName=",
    USER_HUB_API: "/user-management/v1/users",

    EXPORT_FT: "release-wfm-RTACsvExportFromSFDL-CXWFM-30711",
    EXPIRATION_TIME_MILLISECONDS: 1000 * 60
};
exports.getConstants = exportConstant;
