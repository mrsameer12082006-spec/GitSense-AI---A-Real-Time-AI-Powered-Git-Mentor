import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

function ensureSecret(res) {
  if (!JWT_SECRET) {
    console.error('[Auth] JWT_SECRET is not set in environment');
    if (res) res.status(500).json({ error: 'Server configuration error: JWT_SECRET not set' });
    return false;
  }
  return true;
}

export function authenticate(req, res, next) {
  if (!ensureSecret(res)) return;

  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please provide a valid token.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, name, githubScopes }
    req.session = req.session || {};
    req.session.tokenScopes = decoded.githubScopes || '';
    req.session.hasWriteAccess = (decoded.githubScopes || '').includes('repo');
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

export function generateToken(user, githubScopes = '') {
  if (!ensureSecret()) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      githubScopes: githubScopes || ''
    }, 
    JWT_SECRET, 
    { expiresIn: '7d' }
  );
}
