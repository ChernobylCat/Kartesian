// Offline syntax/policy preflight only. Does not authenticate or provision services.
function checkSigningConfig(env) {
  const errors = [];
  const fail = (key, reason) => errors.push(`${key}: ${reason}`);
  const required = [
    'SIGNING_ENV',
    'SIGNING_ENABLED',
    'SIGNING_ORIGIN',
    'EDITOR_ORIGIN',
    'WEBAUTHN_RP_ID',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'CLERK_WEBHOOK_SIGNING_SECRET',
    'DATABASE_URL',
    'AWS_REGION',
    'SIGNING_KMS_KEY_ARN',
    'ENCRYPTION_KMS_KEY_ARN',
    'ASSETS_BUCKET',
    'EVIDENCE_BUCKET',
    'WITNESS_BUCKET',
    'WITNESS_AWS_ACCOUNT_ID',
    'MAIL_FROM',
    'TRUST_BUNDLE_URL',
    'SIGNER_EMAIL_DOMAINS',
    'SIGNER_ACCESS_MODE',
  ];
  for (const key of required) if (!env[key]?.trim()) fail(key, 'required');
  if (!['staging', 'production'].includes(env.SIGNING_ENV))
    fail('SIGNING_ENV', 'must be staging or production');
  if (env.SIGNING_ENABLED !== 'false')
    fail('SIGNING_ENABLED', 'must remain false until runtime and release gates are implemented');
  const url = (key, originOnly = false) => {
    try {
      const value = new URL(env[key]);
      if (
        value.protocol !== 'https:' ||
        value.username ||
        value.password ||
        value.search ||
        value.hash ||
        (originOnly && value.pathname !== '/')
      )
        throw new Error();
      if (
        value.hostname === 'localhost' ||
        value.hostname.endsWith('.localhost') ||
        value.hostname.endsWith('.example') ||
        value.hostname.endsWith('.invalid') ||
        value.hostname === 'example.com' ||
        value.hostname.endsWith('.example.com') ||
        /^[\d.]+$/.test(value.hostname) ||
        value.hostname.includes(':')
      )
        throw new Error();
      if (
        env.SIGNING_ENV === 'production' &&
        value.hostname.split('.').some((label) => ['staging', 'test', 'dev'].includes(label))
      )
        throw new Error();
      return value;
    } catch {
      fail(
        key,
        'must be a real HTTPS URL without credentials/query/fragment; origins cannot have a path',
      );
      return null;
    }
  };
  const signing = url('SIGNING_ORIGIN', true),
    editor = url('EDITOR_ORIGIN', true);
  url('TRUST_BUNDLE_URL');
  if (signing && env.WEBAUTHN_RP_ID !== signing.hostname)
    fail('WEBAUTHN_RP_ID', 'must equal signing hostname');
  if (signing && editor && signing.origin === editor.origin)
    fail('EDITOR_ORIGIN', 'must be separate from signing origin');
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_'))
    fail(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'use isolated live-type Clerk instance for staging/production',
    );
  if (!env.CLERK_SECRET_KEY?.startsWith('sk_live_'))
    fail('CLERK_SECRET_KEY', 'use matching live-type Clerk instance');
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET?.startsWith('whsec_'))
    fail('CLERK_WEBHOOK_SIGNING_SECRET', 'invalid prefix');
  try {
    const database = new URL(env.DATABASE_URL);
    if (
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      !database.hostname ||
      !database.username ||
      database.searchParams.get('sslmode') !== 'verify-full'
    )
      throw new Error();
  } catch {
    fail('DATABASE_URL', 'must be PostgreSQL with TLS verify-full; use provider CA in runtime');
  }
  const arn = /^arn:aws:kms:([a-z0-9-]+):(\d{12}):key\/[a-zA-Z0-9-]+$/;
  const signingArn = arn.exec(env.SIGNING_KMS_KEY_ARN ?? ''),
    encryptionArn = arn.exec(env.ENCRYPTION_KMS_KEY_ARN ?? '');
  for (const [key, match] of [
    ['SIGNING_KMS_KEY_ARN', signingArn],
    ['ENCRYPTION_KMS_KEY_ARN', encryptionArn],
  ])
    if (!match || match[1] !== env.AWS_REGION) fail(key, 'must be a key ARN in AWS_REGION');
  if (env.SIGNING_KMS_KEY_ARN === env.ENCRYPTION_KMS_KEY_ARN)
    fail('ENCRYPTION_KMS_KEY_ARN', 'must differ from seal key');
  if (
    !/^\d{12}$/.test(env.WITNESS_AWS_ACCOUNT_ID ?? '') ||
    env.WITNESS_AWS_ACCOUNT_ID === signingArn?.[2]
  )
    fail('WITNESS_AWS_ACCOUNT_ID', 'must be a distinct AWS account');
  const buckets = ['ASSETS_BUCKET', 'EVIDENCE_BUCKET', 'WITNESS_BUCKET'];
  for (const key of buckets)
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env[key] ?? ''))
      fail(key, 'invalid bucket name');
  if (new Set(buckets.map((key) => env[key])).size !== 3)
    fail('ASSETS_BUCKET/EVIDENCE_BUCKET/WITNESS_BUCKET', 'must be distinct');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.MAIL_FROM ?? ''))
    fail('MAIL_FROM', 'invalid sender address');
  if (
    env.SIGNER_EMAIL_DOMAINS?.split(',')
      .map((s) => s.trim().toLowerCase())
      .sort()
      .join(',') !== 'gmail.com,outlook.com'
  )
    fail('SIGNER_EMAIL_DOMAINS', 'must allow exactly gmail.com,outlook.com');
  if (env.SIGNER_ACCESS_MODE !== 'invite_only') fail('SIGNER_ACCESS_MODE', 'must be invite_only');
  return { valid: errors.length === 0, productionReady: false, errors };
}
module.exports = { checkSigningConfig };
if (require.main === module) {
  const result = checkSigningConfig(process.env);
  // Error messages contain variable names/reasons only, never secret values.
  for (const error of result.errors) process.stderr.write(`${error}\n`);
  process.stdout.write(
    result.valid
      ? 'Configuration syntax passed. External access, key properties, identity proof and production readiness NOT verified.\n'
      : 'Configuration incomplete/unsafe. Signing must remain disabled.\n',
  );
  process.exitCode = result.valid ? 0 : 1;
}
