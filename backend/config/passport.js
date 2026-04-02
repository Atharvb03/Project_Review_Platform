const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const STAFF_ROLES = ['mentor', 'project_coordinator', 'hod'];
// Marker to identify our state vs passport's internal state
const STATE_MARKER = 'prp_v1';

module.exports = function(usersCollection) {
  passport.serializeUser((user, done) => done(null, user._id.toString()));

  passport.deserializeUser(async (id, done) => {
    try {
      const { ObjectId } = require('mongodb');
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback',
    passReqToCallback: true,
    proxy: true,
    store: false,
    state: false
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value.toLowerCase();
      const googleId = profile.id;
      const name = profile.displayName;

      // Decode our custom state — only valid if it has our marker
      let requestedRole = null;
      let code = null;
      let isSignupFlow = false;

      try {
        if (req.query.state) {
          const decoded = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf8'));
          // Only trust state if it has our marker — otherwise it's passport's internal state
          if (decoded._prp === STATE_MARKER && decoded.role) {
            requestedRole = decoded.role;
            code = decoded.code || null;
            isSignupFlow = true;
            console.log('[Google OAuth] Signup flow detected | Role:', requestedRole);
          }
        }
      } catch (e) {
        // Not our state — login flow
      }

      if (!isSignupFlow) {
        console.log('[Google OAuth] Login flow for:', email);
      }

      // Find existing user
      const user = await usersCollection.findOne({
        $or: [{ email }, { googleId }]
      });

      if (user) {
        // Update googleId if missing
        if (!user.googleId) {
          await usersCollection.updateOne(
            { _id: user._id },
            { $set: { googleId, name: name || user.name } }
          );
          user.googleId = googleId;
        }

        const currentRoles = (user.roles?.length ? user.roles : null) || [user.role];

        // Only add new STAFF role during explicit signup flow with valid code
        if (isSignupFlow && requestedRole && STAFF_ROLES.includes(requestedRole) && !currentRoles.includes(requestedRole)) {
          if (requestedRole === 'mentor' && code !== process.env.MENTOR_INVITE_CODE)
            return done(null, false, { message: 'invalid_code' });
          if (requestedRole === 'project_coordinator' && code !== process.env.COORD_CODE)
            return done(null, false, { message: 'invalid_code' });
          if (requestedRole === 'hod' && code !== process.env.HOD_CODE)
            return done(null, false, { message: 'invalid_code' });

          await usersCollection.updateOne({ _id: user._id }, { $addToSet: { roles: requestedRole } });
          user.roles = [...currentRoles, requestedRole];
          console.log('[Google OAuth] Added role:', requestedRole, 'to', email);
        } else {
          user.roles = currentRoles;
        }

        console.log('[Google OAuth] Logged in:', email, '| Roles:', user.roles);
        return done(null, user);
      }

      // ── New user — create temp account, ask for profile completion ──
      const tempUser = {
        email, googleId, name,
        role: 'pending',
        roles: [],
        isVerified: true,
        needsProfile: true,
        createdAt: new Date(),
        authProvider: 'google'
      };
      const result = await usersCollection.insertOne(tempUser);
      tempUser._id = result.insertedId;
      console.log('[Google OAuth] New temp user created (needs profile):', email);
      return done(null, tempUser);

    } catch (err) {
      console.error('[Google OAuth] Strategy error:', err);
      return done(err, null);
    }
  }));

  return passport;
};
