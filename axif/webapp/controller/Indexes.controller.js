sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "axi/axif/utils/validator"
], (Controller, JSONModel, MessageBox, MessageToast, validator) => {
    "use strict";

    return Controller.extend("axi.axif.controller.Indexes", {
        onInit() {
            this._oIndexesModel = this.getOwnerComponent().getModel("indexes");
            this._oIndexesServiceModel = this.getOwnerComponent().getModel("indexesService");
            this._oViewModel = new JSONModel(this._getDefaultViewState());
            this.getView().setModel(this._oViewModel, "indexesView");

            if (!this._oIndexesServiceModel) {
                return;
            }

            this._loadSeriesFromService();
        },

        onSeriesSelectionChange(oEvent) {
            if (this._oViewModel.getProperty("/editMode")) {
                MessageBox.warning("Guarde o cancele la edicion actual antes de cambiar de serie.");
                this._syncSeriesSelection();
                return;
            }

            const sPath = oEvent.getParameter("listItem")?.getBindingContext("indexes")?.getPath();
            const iIndex = this._getIndexFromPath(sPath);

            this._loadSeriesByIndex(iIndex);
        },

        onCreateSeries() {
            this._setViewState({
                currentSeries: this._createEmptySeries(),
                currentPeriod: this._createEmptyPeriod(),
                selectedSeriesIndex: -1,
                selectedPeriodIndex: -1,
                editMode: true,
                periodEditMode: false,
                isNewSeries: true,
                isNewPeriod: false,
                sourceSeriesIndex: this._oViewModel.getProperty("/selectedSeriesIndex")
            });
            this._syncSeriesSelection();
            this._syncPeriodSelection();
        },

        onEditSeries() {
            const iSelectedSeriesIndex = this._oViewModel.getProperty("/selectedSeriesIndex");
            const oSeries = this._getSeriesByIndex(iSelectedSeriesIndex);

            if (!oSeries) {
                MessageBox.warning("Seleccione una serie para editar.");
                return;
            }

            this._setViewState({
                currentSeries: this._clone(oSeries),
                currentPeriod: this._createEmptyPeriod(),
                selectedPeriodIndex: -1,
                editMode: true,
                periodEditMode: false,
                isNewSeries: false,
                isNewPeriod: false,
                sourceSeriesIndex: iSelectedSeriesIndex
            });
            this._syncPeriodSelection();
        },

        onSaveSeries() {
            const oCurrentSeries = this._normalizeSeries(this._clone(this._oViewModel.getProperty("/currentSeries")));
            const iSelectedSeriesIndex = this._oViewModel.getProperty("/selectedSeriesIndex");
            const bIsNewSeries = this._oViewModel.getProperty("/isNewSeries");
            const bPeriodsChanged = this._havePeriodsChanged(oCurrentSeries, iSelectedSeriesIndex);
            const aErrors = [];

            this._oViewModel.setProperty("/currentSeries", this._clone(oCurrentSeries));

            if (this._oViewModel.getProperty("/periodEditMode")) {
                const oPeriodBufferSave = this._saveCurrentPeriodToBuffer();

                if (!oPeriodBufferSave.valid) {
                    MessageBox.error(oPeriodBufferSave.message);
                    return;
                }
            }

            oCurrentSeries.values = (this._oViewModel.getProperty("/currentSeries/values") || [])
                .map((oPeriod) => this._normalizePeriod(oPeriod))
                .sort((oLeft, oRight) => oLeft.period.localeCompare(oRight.period));

            aErrors.push(...this._validateSeries(oCurrentSeries, iSelectedSeriesIndex));

            if (!bIsNewSeries && bPeriodsChanged) {
                aErrors.push("El backend actual no expone persistencia directa para periodos de series existentes. Solo se puede guardar la cabecera sin cambios en periodos.");
            }

            if (aErrors.length) {
                MessageBox.error(Array.from(new Set(aErrors)).join("\n"));
                return;
            }

            this._oViewModel.setProperty("/busy", true);

            if (bIsNewSeries) {
                this._oIndexesServiceModel.create("/IndexSeries", this._mapSeriesToService(oCurrentSeries, true), {
                    success: () => {
                        MessageToast.show("Serie guardada.");
                        this._loadSeriesFromService({
                            seriesCode: oCurrentSeries.code
                        });
                    },
                    error: (oError) => {
                        this._oViewModel.setProperty("/busy", false);
                        MessageBox.error(this._extractServiceError(oError, "No se pudo guardar la serie."));
                    }
                });

                return;
            }

            this._oIndexesServiceModel.update(this._getServiceSeriesPath(oCurrentSeries.code), this._mapSeriesToService(oCurrentSeries, false), {
                success: () => {
                    MessageToast.show("Serie guardada.");
                    this._loadSeriesFromService({
                        seriesCode: oCurrentSeries.code
                    });
                },
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, "No se pudo guardar la serie."));
                }
            });
        },

        onCancelEdit() {
            const iSelectedSeriesIndex = this._oViewModel.getProperty("/selectedSeriesIndex");
            const iSourceSeriesIndex = this._oViewModel.getProperty("/sourceSeriesIndex");

            if (this._oViewModel.getProperty("/isNewSeries")) {
                if (iSourceSeriesIndex > -1) {
                    this._loadSeriesByIndex(iSourceSeriesIndex);
                } else {
                    this._clearSelection();
                }

                return;
            }

            this._loadSeriesByIndex(iSelectedSeriesIndex);
        },

        onCreatePeriod() {
            if (!this._oViewModel.getProperty("/editMode")) {
                MessageBox.warning("Active la edicion de la serie para agregar periodos.");
                return;
            }

            this._oViewModel.setProperty("/currentPeriod", this._createEmptyPeriod());
            this._oViewModel.setProperty("/selectedPeriodIndex", -1);
            this._oViewModel.setProperty("/periodEditMode", true);
            this._oViewModel.setProperty("/isNewPeriod", true);
            this._syncPeriodSelection();
        },

        onEditPeriod() {
            const iSelectedPeriodIndex = this._oViewModel.getProperty("/selectedPeriodIndex");
            const aPeriods = this._oViewModel.getProperty("/currentSeries/values") || [];

            if (iSelectedPeriodIndex < 0 || !aPeriods[iSelectedPeriodIndex]) {
                MessageBox.warning("Seleccione un periodo para editar.");
                return;
            }

            this._oViewModel.setProperty("/currentPeriod", this._clone(aPeriods[iSelectedPeriodIndex]));
            this._oViewModel.setProperty("/periodEditMode", true);
            this._oViewModel.setProperty("/isNewPeriod", false);
        },

        onDeletePeriod() {
            const iSelectedPeriodIndex = this._oViewModel.getProperty("/selectedPeriodIndex");
            const aPeriods = this._clone(this._oViewModel.getProperty("/currentSeries/values") || []);

            if (iSelectedPeriodIndex < 0 || !aPeriods[iSelectedPeriodIndex]) {
                MessageBox.warning("Seleccione un periodo para eliminar.");
                return;
            }

            aPeriods.splice(iSelectedPeriodIndex, 1);
            this._oViewModel.setProperty("/currentSeries/values", aPeriods);
            this._oViewModel.setProperty("/currentPeriod", this._createEmptyPeriod());
            this._oViewModel.setProperty("/selectedPeriodIndex", -1);
            this._oViewModel.setProperty("/periodEditMode", false);
            this._oViewModel.setProperty("/isNewPeriod", false);
            this._syncPeriodSelection();
            MessageToast.show("Periodo eliminado del buffer de la serie.");
        },

        onPeriodSelectionChange(oEvent) {
            if (this._oViewModel.getProperty("/periodEditMode")) {
                MessageBox.warning("Guarde o descarte la edicion actual del periodo.");
                this._syncPeriodSelection();
                return;
            }

            const sPath = oEvent.getParameter("listItem")?.getBindingContext("indexesView")?.getPath();
            const iIndex = this._getIndexFromPath(sPath);
            const aPeriods = this._oViewModel.getProperty("/currentSeries/values") || [];
            const oPeriod = aPeriods[iIndex];

            this._oViewModel.setProperty("/selectedPeriodIndex", iIndex);
            this._oViewModel.setProperty("/currentPeriod", this._clone(oPeriod || this._createEmptyPeriod()));
        },

        _loadSeriesFromService(oOptions) {
            this._oViewModel.setProperty("/busy", true);

            this._oIndexesServiceModel.read("/IndexSeries", {
                urlParameters: {
                    "$expand": "to_Periods"
                },
                success: (oData) => {
                    const aSeries = (oData.results || []).map((oSeries) => this._mapSeriesFromService(oSeries));

                    this._oIndexesModel.setProperty("/series", aSeries);
                    this._oIndexesModel.setProperty("/indexes", this._buildIndexSummaries(aSeries));
                    this._initializeState(oOptions);
                    this._oViewModel.setProperty("/busy", false);
                },
                error: (oError) => {
                    this._oViewModel.setProperty("/busy", false);
                    MessageBox.error(this._extractServiceError(oError, "No se pudieron leer las series de indices."));
                }
            });
        },

        _initializeState(oOptions) {
            const aSeries = this._oIndexesModel.getProperty("/series") || [];
            const sSeriesCodeToSelect = oOptions?.seriesCode;

            if (!aSeries.length) {
                this._clearSelection();
                return;
            }

            if (sSeriesCodeToSelect) {
                const iMatch = aSeries.findIndex((oSeries) => oSeries.code === sSeriesCodeToSelect);

                if (iMatch > -1) {
                    this._loadSeriesByIndex(iMatch);
                    return;
                }
            }

            if (this._oViewModel.getProperty("/selectedSeriesIndex") > -1) {
                this._loadSeriesByIndex(this._oViewModel.getProperty("/selectedSeriesIndex"));
                return;
            }

            this._loadSeriesByIndex(0);
        },

        _loadSeriesByIndex(iSelectedSeriesIndex) {
            const oSeries = this._getSeriesByIndex(iSelectedSeriesIndex);

            if (!oSeries) {
                this._clearSelection();
                return;
            }

            this._setViewState({
                currentSeries: this._clone(oSeries),
                currentPeriod: this._createEmptyPeriod(),
                selectedSeriesIndex: iSelectedSeriesIndex,
                selectedPeriodIndex: -1,
                editMode: false,
                periodEditMode: false,
                isNewSeries: false,
                isNewPeriod: false,
                sourceSeriesIndex: iSelectedSeriesIndex
            });
            this._syncSeriesSelection();
            this._syncPeriodSelection();
        },

        _clearSelection() {
            this._setViewState(this._getDefaultViewState());
            this._syncSeriesSelection();
            this._syncPeriodSelection();
        },

        _saveCurrentPeriodToBuffer() {
            const oCurrentPeriod = this._normalizePeriod(this._clone(this._oViewModel.getProperty("/currentPeriod")));
            const aPeriods = this._clone(this._oViewModel.getProperty("/currentSeries/values") || []);
            const iSelectedPeriodIndex = this._oViewModel.getProperty("/selectedPeriodIndex");
            const aErrors = [];

            if (!validator.hasValue(oCurrentPeriod.period)) {
                aErrors.push("El periodo es obligatorio.");
            }

            if (!this._isValidPeriod(oCurrentPeriod.period)) {
                aErrors.push("El periodo debe tener formato YYYY-MM.");
            }

            if (!validator.hasValue(oCurrentPeriod.value) || !validator.isPositiveNumber(oCurrentPeriod.value)) {
                aErrors.push("El valor del periodo debe ser numerico y mayor o igual a cero.");
            }

            if (aErrors.length) {
                return {
                    valid: false,
                    message: aErrors.join("\n")
                };
            }

            if (this._oViewModel.getProperty("/isNewPeriod")) {
                aPeriods.push(oCurrentPeriod);
                this._oViewModel.setProperty("/selectedPeriodIndex", aPeriods.length - 1);
            } else if (iSelectedPeriodIndex > -1) {
                aPeriods[iSelectedPeriodIndex] = oCurrentPeriod;
            }

            aPeriods.sort((oLeft, oRight) => oLeft.period.localeCompare(oRight.period));
            this._oViewModel.setProperty("/currentSeries/values", aPeriods);
            this._oViewModel.setProperty("/currentPeriod", this._clone(oCurrentPeriod));
            this._oViewModel.setProperty("/periodEditMode", false);
            this._oViewModel.setProperty("/isNewPeriod", false);
            this._oViewModel.setProperty("/selectedPeriodIndex", aPeriods.findIndex((oPeriod) => oPeriod.period === oCurrentPeriod.period));
            this._syncPeriodSelection();

            return {
                valid: true
            };
        },

        _validateSeries(oSeries, iSelectedSeriesIndex) {
            const aErrors = [];
            const aAllSeries = this._oIndexesModel.getProperty("/series") || [];
            const aPeriods = oSeries.values || [];
            const aSortedPeriods = aPeriods.slice().sort((oLeft, oRight) => oLeft.period.localeCompare(oRight.period));
            const mSeenPeriods = new Map();

            if (!validator.hasValue(oSeries.code)) {
                aErrors.push("Code es obligatorio.");
            }

            if (!validator.hasValue(oSeries.name)) {
                aErrors.push("Name es obligatorio.");
            }

            if (!validator.hasValue(oSeries.country)) {
                aErrors.push("Country es obligatorio.");
            }

            if (!validator.hasValue(oSeries.periodicity)) {
                aErrors.push("Periodicity es obligatoria.");
            }

            if (validator.hasValue(oSeries.periodicity) && oSeries.periodicity !== "MONTHLY") {
                aErrors.push("Solo se admite periodicidad MONTHLY.");
            }

            if (!aPeriods.length) {
                aErrors.push("La serie debe tener al menos un periodo.");
            }

            if (aAllSeries.some((oExistingSeries, iIndex) => iIndex !== iSelectedSeriesIndex && oExistingSeries.code === oSeries.code)) {
                aErrors.push("Ya existe una serie con el mismo Code.");
            }

            aSortedPeriods.forEach((oPeriod, iIndex) => {
                if (!this._isValidPeriod(oPeriod.period)) {
                    aErrors.push(`El periodo ${oPeriod.period || "(vacio)"} no tiene formato YYYY-MM.`);
                }

                if (!validator.hasValue(oPeriod.value) || !validator.isPositiveNumber(oPeriod.value)) {
                    aErrors.push(`El valor del periodo ${oPeriod.period || "(vacio)"} debe ser numerico y mayor o igual a cero.`);
                }

                if (mSeenPeriods.has(oPeriod.period)) {
                    aErrors.push(`El periodo ${oPeriod.period} esta duplicado.`);
                } else {
                    mSeenPeriods.set(oPeriod.period, true);
                }

                if (iIndex > 0 && this._isValidPeriod(oPeriod.period) && this._isValidPeriod(aSortedPeriods[iIndex - 1].period)) {
                    const sExpectedPeriod = this._getNextPeriod(aSortedPeriods[iIndex - 1].period);

                    if (oPeriod.period !== sExpectedPeriod) {
                        aErrors.push(`La serie tiene huecos mensuales entre ${aSortedPeriods[iIndex - 1].period} y ${oPeriod.period}.`);
                    }
                }
            });

            return Array.from(new Set(aErrors));
        },

        _havePeriodsChanged(oCurrentSeries, iSelectedSeriesIndex) {
            const oOriginalSeries = this._getSeriesByIndex(iSelectedSeriesIndex);

            if (!oOriginalSeries) {
                return false;
            }

            return JSON.stringify(this._normalizePeriodsForCompare(oOriginalSeries.values || [])) !==
                JSON.stringify(this._normalizePeriodsForCompare(oCurrentSeries.values || []));
        },

        _normalizePeriodsForCompare(aPeriods) {
            return aPeriods
                .map((oPeriod) => this._normalizePeriod(oPeriod))
                .sort((oLeft, oRight) => oLeft.period.localeCompare(oRight.period));
        },

        _mapSeriesFromService(oSeries) {
            const aPeriods = oSeries.to_Periods?.results || oSeries.to_Periods || [];

            return {
                code: oSeries.SeriesCode,
                name: oSeries.Name || "",
                country: oSeries.Country,
                periodicity: oSeries.Periodicity,
                active: oSeries.Active === "X",
                values: aPeriods
                    .map((oPeriod) => ({
                        period: oPeriod.PeriodId,
                        value: Number(oPeriod.IndexValue || 0),
                        active: oPeriod.Active === "X"
                    }))
                    .sort((oLeft, oRight) => oLeft.period.localeCompare(oRight.period))
            };
        },

        _mapSeriesToService(oSeries, bIncludePeriods) {
            const oPayload = {
                SeriesCode: oSeries.code,
                Name: oSeries.name,
                Country: oSeries.country,
                Periodicity: oSeries.periodicity,
                Active: oSeries.active ? "X" : ""
            };

            if (bIncludePeriods) {
                oPayload.to_Periods = oSeries.values.map((oPeriod) => ({
                    PeriodId: oPeriod.period,
                    IndexValue: Number(oPeriod.value),
                    Active: oPeriod.active ? "X" : ""
                }));
            }

            return oPayload;
        },

        _buildIndexSummaries(aSeries) {
            return aSeries.map((oSeries) => {
                const aSortedValues = (oSeries.values || []).slice().sort((oLeft, oRight) => oLeft.period.localeCompare(oRight.period));
                const oLastValue = aSortedValues[aSortedValues.length - 1];
                const oPrevValue = aSortedValues[aSortedValues.length - 2];
                let sTrend = "STABLE";

                if (oLastValue && oPrevValue) {
                    if (Number(oLastValue.value) > Number(oPrevValue.value)) {
                        sTrend = "UP";
                    } else if (Number(oLastValue.value) < Number(oPrevValue.value)) {
                        sTrend = "DOWN";
                    }
                }

                return {
                    code: oSeries.code,
                    name: oSeries.name,
                    category: "Inflation",
                    value: oLastValue ? Number(oLastValue.value).toFixed(2) : "0.00",
                    unit: "idx",
                    trend: sTrend
                };
            });
        },

        _extractServiceError(oError, sFallbackMessage) {
            let sMessage = sFallbackMessage;

            if (oError?.responseText) {
                try {
                    sMessage = JSON.parse(oError.responseText)?.error?.message?.value || sMessage;
                } catch (oParseError) {
                    sMessage = oError.responseText || sMessage;
                }
            }

            return sMessage;
        },

        _getServiceSeriesPath(sSeriesCode) {
            const sKeyPath = this._oIndexesServiceModel.createKey("IndexSeries", {
                SeriesCode: sSeriesCode
            });

            return sKeyPath.startsWith("/") ? sKeyPath : `/${sKeyPath}`;
        },

        _syncSeriesSelection() {
            const oList = this.byId("seriesList");
            const iSelectedSeriesIndex = this._oViewModel.getProperty("/selectedSeriesIndex");
            const aItems = oList ? oList.getItems() : [];

            if (!oList) {
                return;
            }

            if (iSelectedSeriesIndex > -1 && aItems[iSelectedSeriesIndex]) {
                oList.setSelectedItem(aItems[iSelectedSeriesIndex]);
            } else {
                oList.removeSelections(true);
            }
        },

        _syncPeriodSelection() {
            const oTable = this.byId("periodTable");
            const iSelectedPeriodIndex = this._oViewModel.getProperty("/selectedPeriodIndex");
            const aItems = oTable ? oTable.getItems() : [];

            if (!oTable) {
                return;
            }

            if (iSelectedPeriodIndex > -1 && aItems[iSelectedPeriodIndex]) {
                oTable.setSelectedItem(aItems[iSelectedPeriodIndex]);
            } else {
                oTable.removeSelections(true);
            }
        },

        _getSeriesByIndex(iIndex) {
            return (this._oIndexesModel.getProperty("/series") || [])[iIndex];
        },

        _getIndexFromPath(sPath) {
            const aParts = (sPath || "").split("/");
            return parseInt(aParts[aParts.length - 1], 10);
        },

        _createEmptySeries() {
            return {
                code: "",
                name: "",
                country: "",
                active: true,
                periodicity: "MONTHLY",
                values: []
            };
        },

        _createEmptyPeriod() {
            return {
                period: "",
                value: "",
                active: true
            };
        },

        _normalizeSeries(oSeries) {
            return {
                code: this._trimValue(oSeries.code).toUpperCase(),
                name: this._trimValue(oSeries.name),
                country: this._trimValue(oSeries.country).toUpperCase(),
                active: !!oSeries.active,
                periodicity: this._trimValue(oSeries.periodicity).toUpperCase(),
                values: (oSeries.values || []).map((oPeriod) => this._normalizePeriod(oPeriod))
            };
        },

        _normalizePeriod(oPeriod) {
            return {
                period: this._trimValue(oPeriod.period),
                value: validator.hasValue(oPeriod.value) ? Number(oPeriod.value) : "",
                active: !!oPeriod.active
            };
        },

        _getDefaultViewState() {
            return {
                currentSeries: this._createEmptySeries(),
                currentPeriod: this._createEmptyPeriod(),
                selectedSeriesIndex: -1,
                selectedPeriodIndex: -1,
                editMode: false,
                periodEditMode: false,
                isNewSeries: false,
                isNewPeriod: false,
                sourceSeriesIndex: -1,
                busy: false
            };
        },

        _setViewState(oState) {
            Object.keys(oState).forEach((sKey) => {
                this._oViewModel.setProperty(`/${sKey}`, oState[sKey]);
            });
        },

        _clone(oValue) {
            return JSON.parse(JSON.stringify(oValue));
        },

        _trimValue(vValue) {
            return typeof vValue === "string" ? vValue.trim() : vValue;
        },

        _isValidPeriod(sPeriod) {
            return /^\d{4}-(0[1-9]|1[0-2])$/.test(sPeriod || "");
        },

        _getNextPeriod(sPeriod) {
            let iYear = parseInt(sPeriod.slice(0, 4), 10);
            let iMonth = parseInt(sPeriod.slice(5, 7), 10);

            iMonth += 1;

            if (iMonth === 13) {
                iMonth = 1;
                iYear += 1;
            }

            return `${iYear}-${String(iMonth).padStart(2, "0")}`;
        }
    });
});
