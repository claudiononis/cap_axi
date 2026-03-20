sap.ui.define([], () => {
    "use strict";

    return {
        hasValue(vValue) {
            if (typeof vValue === "string") {
                return vValue.trim() !== "";
            }

            return vValue !== undefined && vValue !== null && vValue !== "";
        },

        isEmail(sEmail) {
            return this.hasValue(sEmail) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sEmail);
        },

        isPositiveNumber(vValue) {
            return !Number.isNaN(Number(vValue)) && Number(vValue) >= 0;
        },

        isDateRangeValid(sValidFrom, sValidTo) {
            if (!this.hasValue(sValidFrom) || !this.hasValue(sValidTo)) {
                return true;
            }

            return this._toDateValue(sValidFrom) <= this._toDateValue(sValidTo);
        },

        doRangesOverlap(sFromA, sToA, sFromB, sToB) {
            const iFromA = this._toDateValue(sFromA, "0001-01-01");
            const iToA = this._toDateValue(sToA, "9999-12-31");
            const iFromB = this._toDateValue(sFromB, "0001-01-01");
            const iToB = this._toDateValue(sToB, "9999-12-31");

            return iFromA <= iToB && iFromB <= iToA;
        },

        _toDateValue(sDate, sFallback) {
            const sSafeDate = this.hasValue(sDate) ? sDate : sFallback;

            return Date.parse(`${sSafeDate}T00:00:00`);
        }
    };
});
