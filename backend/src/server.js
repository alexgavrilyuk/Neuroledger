require('dotenv').config(); // Load environment variables first
const app = require('./app');

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`NeuroLedger Backend listening on port ${PORT}`);
});