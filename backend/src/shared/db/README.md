# backend/src/shared/db/README.md

## Shared: Database Connection

This directory manages the connection to the MongoDB database using Mongoose.

### Files

*   **`connection.js`**:
    *   Imports the MongoDB connection URI from the shared config (`shared/config`).
    *   Defines an asynchronous function `connectDB` that establishes the connection using `mongoose.connect()`.
    *   Includes basic error handling and logging for the connection process. Exits the application if the connection fails.
    *   Exports the `connectDB` function.

### Usage

The `connectDB` function is called once at application startup in `backend/src/server.js` before starting the HTTP server.

```javascript
// backend/src/server.js
const connectDB = require('./shared/db/connection');
// ...
connectDB().then(() => {
  // Start server...
});
```
Dependencies:

mongoose
shared/config
shared/utils/logger