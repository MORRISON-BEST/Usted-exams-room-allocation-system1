// backend/utils/seedAdmin.js
// Run once: node utils/seedAdmin.js
// Creates the default admin account with a secure bcrypt hash
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const db     = require('../config/db');

(async () => {
  try {
    const password  = 'Admin@USTED2024';
    const hash      = await bcrypt.hash(password, 12);

    await db.execute(`
      INSERT INTO users (name, username, password_hash, role)
      VALUES ('System Administrator', 'admin', ?, 'admin')
      ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
    `, [hash]);

    console.log('✅  Admin seeded');
    console.log('   Username : admin');
    console.log('   Password : Admin@USTED2024');
    console.log('   ⚠️  Change this password after first login!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
})();
