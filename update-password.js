const bcrypt = require('bcrypt');
const { Client } = require('pg');

async function updatePassword() {
  const client = new Client({
    host: 'postgres',
    user: 'postgres',
    password: 'YDrive2025SecureDB!',
    database: 'filestorage'
  });
  
  await client.connect();
  
  const hash = bcrypt.hashSync('alvin123', 10);
  console.log('Generated hash:', hash);
  
  const result = await client.query(
    'UPDATE users SET password_hash = $1 WHERE nip = $2',
    [hash, '25129120']
  );
  
  console.log('Updated rows:', result.rowCount);
  await client.end();
}

updatePassword().catch(console.error);
