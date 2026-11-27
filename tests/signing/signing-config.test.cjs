const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSigningConfig } = require('../../scripts/tools/check-signing-config.cjs');
function fixture() {
  return {
    SIGNING_ENV: 'staging',
    SIGNING_ENABLED: 'false',
    SIGNING_ORIGIN: 'https://sign.kartesian-unit.net',
    EDITOR_ORIGIN: 'https://editor.kartesian-unit.net',
    WEBAUTHN_RP_ID: 'sign.kartesian-unit.net',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
    CLERK_SECRET_KEY: 'sk_live_fixture',
    CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_fixture',
    DATABASE_URL: 'postgresql://role:secret@db.kartesian-unit.net/workspace?sslmode=verify-full',
    AWS_REGION: 'ap-southeast-1',
    SIGNING_KMS_KEY_ARN: 'arn:aws:kms:ap-southeast-1:111111111111:key/seal',
    ENCRYPTION_KMS_KEY_ARN: 'arn:aws:kms:ap-southeast-1:111111111111:key/encryption',
    ASSETS_BUCKET: 'fixture-assets',
    EVIDENCE_BUCKET: 'fixture-evidence',
    WITNESS_BUCKET: 'fixture-witness',
    WITNESS_AWS_ACCOUNT_ID: '222222222222',
    MAIL_FROM: 'notify@kartesian-unit.net',
    TRUST_BUNDLE_URL: 'https://trust.kartesian-unit.net/keys.json',
    SIGNER_EMAIL_DOMAINS: 'gmail.com,outlook.com',
    SIGNER_ACCESS_MODE: 'invite_only',
  };
}
test('complete syntax never implies production readiness', () => {
  const result = checkSigningConfig(fixture());
  assert.equal(result.valid, true);
  assert.equal(result.productionReady, false);
});
for (const [key, value] of Object.entries({
  SIGNING_ENABLED: 'true',
  CLERK_SECRET_KEY: 'sk_test_sensitive',
  SIGNER_ACCESS_MODE: 'open',
  SIGNER_EMAIL_DOMAINS: 'gmail.com,evil.net',
  WEBAUTHN_RP_ID: 'unrelated.net',
  DATABASE_URL: 'postgresql://user:password@db/db?sslmode=disable',
  SIGNING_ORIGIN: 'https://sign.example.com',
  WITNESS_AWS_ACCOUNT_ID: '111111111111',
  EDITOR_ORIGIN: 'https://sign.kartesian-unit.net',
}))
  test(`rejects unsafe ${key}`, () => {
    const env = fixture();
    env[key] = value;
    const result = checkSigningConfig(env);
    assert.equal(result.valid, false);
    assert.equal(result.errors.join('\n').includes(value), false);
  });
test('empty environment fails closed', () => assert.equal(checkSigningConfig({}).valid, false));
test('production refuses staging origins', () => {
  const env = fixture();
  env.SIGNING_ENV = 'production';
  env.SIGNING_ORIGIN = 'https://sign.staging.kartesian-unit.net';
  assert.equal(checkSigningConfig(env).valid, false);
});
test('same key cannot encrypt and seal', () => {
  const env = fixture();
  env.ENCRYPTION_KMS_KEY_ARN = env.SIGNING_KMS_KEY_ARN;
  assert.equal(checkSigningConfig(env).valid, false);
});
