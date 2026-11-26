/**
 * SALO — Shared Password Policy (mirrors backend PasswordPolicy.php)
 */

export const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword1',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'admin123',
  'welcome123',
  'letmein123',
  'iloveyou',
  'abc12345',
  '1234qwer',
  'changeme',
  'default123',
  'monkey123',
  'dragon123',
  'salo1234',
  'salo@123',
]);

export function evaluatePasswordPolicy(password = '', { username = '', email = '' } = {}) {
  const pw = String(password || '');
  const lowerPw = pw.toLowerCase();
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();

  const containsUsername = cleanUser.length >= 2 && lowerPw.includes(cleanUser);
  const containsEmail = cleanEmail.length >= 3 && lowerPw.includes(cleanEmail);
  const isCommon = pw.length > 0 && COMMON_PASSWORDS.has(lowerPw);

  const checks = [
    { key: 'length', label: 'At least 8 characters', passed: pw.length >= 8 },
    { key: 'uppercase', label: 'One uppercase letter (A-Z)', passed: /[A-Z]/.test(pw) },
    { key: 'lowercase', label: 'One lowercase letter (a-z)', passed: /[a-z]/.test(pw) },
    { key: 'number', label: 'One number (0-9)', passed: /[0-9]/.test(pw) },
    { key: 'special', label: 'One special character (!@#$...)', passed: /[^A-Za-z0-9\s]/.test(pw) },
    {
      key: 'noPersonal',
      label: 'Does not contain your username or email',
      passed: pw.length > 0 && !containsUsername && !containsEmail,
    },
    {
      key: 'notCommon',
      label: 'Not a commonly used password',
      passed: pw.length > 0 && !isCommon,
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const isValid = checks.every((c) => c.passed);

  let strengthLabel;
  let strengthLevel;
  if (pw.length === 0) {
    strengthLabel = '';
    strengthLevel = 0;
  } else if (passedCount <= 3) {
    strengthLabel = 'Weak';
    strengthLevel = 1;
  } else if (passedCount <= 5) {
    strengthLabel = 'Fair';
    strengthLevel = 2;
  } else if (!isValid || pw.length < 10) {
    strengthLabel = 'Good';
    strengthLevel = 3;
  } else {
    strengthLabel = 'Strong';
    strengthLevel = 4;
  }

  return {
    checks,
    passedCount,
    isValid,
    strengthLabel,
    strengthLevel,
    containsUsername,
    containsEmail,
    isCommon,
  };
}

export function getPasswordPolicyError(password = '', context = {}) {
  const pw = String(password || '');
  if (!pw) return 'Password is required.';
  const result = evaluatePasswordPolicy(pw, context);
  if (result.isValid) return null;
  if (result.containsUsername) return 'Password must not contain your username.';
  if (result.containsEmail) return 'Password must not contain your email address.';
  if (result.isCommon) return 'Password is too common. Please choose a stronger password.';
  const firstFailed = result.checks.find((c) => !c.passed);
  return firstFailed ? `Password requirement not met: ${firstFailed.label}.` : 'Password does not meet security requirements.';
}
