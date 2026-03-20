sap.ui.define([], () => {
    "use strict";

    return {
        statusText(sStatus) {
            const mTexts = {
                SUCCESS: "Success",
                RUNNING: "Running",
                FAILED: "Failed",
                SIMULATED: "Simulated",
                POSTED: "Posted",
                REVERSED: "Reversed",
                DRAFT: "Draft"
            };

            return mTexts[sStatus] || sStatus || "Unknown";
        },

        statusState(sStatus) {
            const mStates = {
                SUCCESS: "Success",
                RUNNING: "Information",
                FAILED: "Error",
                SIMULATED: "Information",
                POSTED: "Success",
                REVERSED: "Warning",
                DRAFT: "None"
            };

            return mStates[sStatus] || "None";
        }
    };
});
