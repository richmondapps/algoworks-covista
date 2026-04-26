"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
// Use Application Default Credentials
admin.initializeApp();
const db = admin.firestore();
async function main() {
    console.log("Fetching student document A00302996...");
    const docRef = db.collection('salesforce_opportunities').doc('A00302996');
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        console.log("Document does not exist.");
        return;
    }
    const data = docSnap.data();
    console.log("Fetching subcollection ai_insights/latest...");
    const latestRef = docRef.collection('ai_insights').doc('latest');
    const latestSnap = await latestRef.get();
    const output = {
        root_data: data,
        subcollection_data: latestSnap.exists ? latestSnap.data() : null
    };
    fs.writeFileSync('student_debug.json', JSON.stringify(output, null, 2));
    console.log("Saved to student_debug.json");
    process.exit(0);
}
main().catch(console.error);
//# sourceMappingURL=query-student.js.map