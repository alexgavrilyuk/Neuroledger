// backend/src/features/code_execution/README.md
// ** UPDATED FILE - Reflect DEPRECATION for client-side execution **

## Feature: Code Execution Service (DEPRECATED / REPURPOSED)

**NOTE:** As of the shift to client-side Web Worker execution (Phase 5 - Browser), this backend service is **no longer responsible for executing AI-generated code**.

The `executeGeneratedCode` function remains as a highly insecure placeholder and **should not be called**.

The `fetchDataForSandbox` function, which retrieves raw data content from GCS, is **still used** by the `prompt.service.js` *if* direct backend data fetching were ever needed again, but is not directly involved in the current client-side execution flow.

---
**🚨 CRITICAL SECURITY WARNING 🚨**

The `executeGeneratedCode` function using `new Function()` is **NOT SECURE** and **MUST NOT BE USED** for untrusted code execution in production.
---

### Files

*   **`execution.service.js`**: Contains the INSECURE placeholder `executeGeneratedCode` (DO NOT USE) and the potentially reusable (but currently unused in the main flow) `fetchDataForSandbox`.
*   **`README.md`**: This file.

### Interaction

*   Currently **NOT** called by `prompt.service.js` for execution.