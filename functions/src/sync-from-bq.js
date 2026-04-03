"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var bigquery_1 = require("@google-cloud/bigquery");
var admin = require("firebase-admin");
// Initialize SDKs natively on Application Default Credentials
admin.initializeApp({ projectId: 'algoworks-dev' });
var db = admin.firestore();
var bq = new bigquery_1.BigQuery({ projectId: 'algoworks-dev' });
var DATASET = 'covista_demo';
function syncBigQuery() {
    return __awaiter(this, void 0, void 0, function () {
        var courses, courseMap, _i, courses_1, row, contingencies, contMap, _a, contingencies_1, row, coreRows, batch, count, _b, coreRows_1, row, studentId, payload, docRef;
        var _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    console.log('[Node Ingester] Fetching BigQuery Tables...');
                    return [4 /*yield*/, bq.query("SELECT * FROM `algoworks-dev.".concat(DATASET, ".student_courses`"))];
                case 1:
                    courses = (_h.sent())[0];
                    courseMap = {};
                    for (_i = 0, courses_1 = courses; _i < courses_1.length; _i++) {
                        row = courses_1[_i];
                        if (!courseMap[row.student_id])
                            courseMap[row.student_id] = [];
                        courseMap[row.student_id].push({
                            courseId: row.course_id,
                            isAccredited: row.is_accredited,
                            registrationStatus: row.course_registration_status,
                            firstLoginAt: ((_c = row.first_login_at) === null || _c === void 0 ? void 0 : _c.value) || null,
                            firstDiscussionPostAt: ((_d = row.first_discussion_post_at) === null || _d === void 0 ? void 0 : _d.value) || null
                        });
                    }
                    return [4 /*yield*/, bq.query("SELECT * FROM `algoworks-dev.".concat(DATASET, ".student_contingencies`"))];
                case 2:
                    contingencies = (_h.sent())[0];
                    contMap = {};
                    for (_a = 0, contingencies_1 = contingencies; _a < contingencies_1.length; _a++) {
                        row = contingencies_1[_a];
                        if (!contMap[row.student_id])
                            contMap[row.student_id] = [];
                        contMap[row.student_id].push({
                            id: row.contingency_id,
                            institutionName: row.institution_name,
                            type: row.contingency_type,
                            status: row.contingency_status
                        });
                    }
                    return [4 /*yield*/, bq.query("SELECT * FROM `algoworks-dev.".concat(DATASET, ".student_core`"))];
                case 3:
                    coreRows = (_h.sent())[0];
                    batch = db.batch();
                    count = 0;
                    _b = 0, coreRows_1 = coreRows;
                    _h.label = 4;
                case 4:
                    if (!(_b < coreRows_1.length)) return [3 /*break*/, 7];
                    row = coreRows_1[_b];
                    studentId = String(row.student_id);
                    payload = {
                        id: studentId,
                        name: row.full_name,
                        program: row.program_code,
                        institution: row.institution_code,
                        status: row.enrollment_status,
                        programStartDate: ((_e = row.program_start_date) === null || _e === void 0 ? void 0 : _e.value) || null,
                        reserveDate: ((_f = row.reserve_date) === null || _f === void 0 ? void 0 : _f.value) || null,
                        requirements: {
                            officialTranscriptsReceived: row.trf_form_on_file,
                            fundingPlan: row.funding_plan_status === 'Approved',
                            orientationStarted: !!row.wwow_orientation_started_at,
                        },
                        courseActivity: courseMap[studentId] || [],
                        contingencies: contMap[studentId] || [],
                        lastUpdatedByPipelineAt: ((_g = row.etl_updated_at) === null || _g === void 0 ? void 0 : _g.value) || null
                    };
                    docRef = db.collection('student_records').doc(studentId);
                    batch.set(docRef, payload, { merge: true });
                    count++;
                    if (!(count % 400 === 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, batch.commit()];
                case 5:
                    _h.sent();
                    console.log("[Node Ingester] Committed batch. Total: ".concat(count));
                    batch = db.batch();
                    _h.label = 6;
                case 6:
                    _b++;
                    return [3 /*break*/, 4];
                case 7:
                    if (!(count % 400 !== 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, batch.commit()];
                case 8:
                    _h.sent();
                    _h.label = 9;
                case 9:
                    console.log("[Node Ingester] Finished! Successfully mapped ".concat(count, " records into Firestore."));
                    return [2 /*return*/];
            }
        });
    });
}
syncBigQuery().catch(console.error);
