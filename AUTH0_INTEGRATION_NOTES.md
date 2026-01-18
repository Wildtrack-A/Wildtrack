# Auth0 Integration Notes

This document outlines what has been prepared for Auth0 integration and what needs to be done.

## ✅ What's Already Done

### Backend (Python FastAPI)

1. **Database Migration** (`sql/11_add_user_id_to_journals.sql`):
   - Added `user_id` column to `journals` table
   - Created index for user-based queries
   - **Action Required**: Run this SQL in Supabase SQL Editor

2. **Authentication Helper** (`app/auth.py`):
   - Created `get_user_id_from_token()` function to extract user ID from Auth0 JWT
   - Currently uses placeholder token decoding (without verification)
   - **Action Required**: Update with actual Auth0 domain/audience once provided

3. **API Endpoints Updated** (`app/api/v1/journals.py`):
   - All endpoints now require authentication
   - All queries filter by `user_id`
   - User ownership verification for update/delete operations
   - Journals automatically associated with authenticated user on creation

4. **Models Updated** (`app/models/journal.py`):
   - `Journal` model includes `user_id` field

5. **Dependencies** (`requirements.txt`):
   - Added `PyJWT==2.8.0` for token decoding

### Frontend (React Native/Expo)

1. **API Service** (`services/api.ts`):
   - Token storage functions: `getAuthToken()`, `setAuthToken()`, `removeAuthToken()`
   - All API calls automatically include `Authorization: Bearer <token>` header
   - Uses AsyncStorage for token persistence

2. **Login Page** (`app/login.tsx`):
   - Added TODO comments showing where to integrate Auth0
   - Placeholder for token storage after successful login

3. **Home Page** (`app/home.tsx`):
   - Already auto-loads journals on mount via `useEffect`
   - Will automatically load user's journals once token is set

## 🔧 What Needs to Be Done

### From Your Friend (Auth0 Setup)

1. **Auth0 Configuration Details**:
   - Auth0 domain (e.g., `your-tenant.auth0.com`)
   - Auth0 audience/API identifier
   - User ID claim name (typically `sub` in Auth0 JWT)
   - Token format/structure

2. **Auth0 SDK Integration**:
   - Install Auth0 React Native SDK
   - Implement login/signup flows
   - Get access token after authentication

### Backend Updates Needed

1. **Update `app/auth.py`**:
   - Replace placeholder token decoding with actual Auth0 validation
   - Add Auth0 domain and audience to environment variables
   - Implement proper JWT verification using Auth0's public keys
   - See commented example code in `app/auth.py` for reference

2. **Environment Variables** (`.env`):
   ```env
   AUTH0_DOMAIN=your-tenant.auth0.com
   AUTH0_AUDIENCE=your-api-identifier
   ```

### Frontend Updates Needed

1. **Install Auth0 SDK**:
   ```bash
   npm install react-native-auth0
   ```

2. **Update `app/login.tsx`**:
   - Replace TODO comments with actual Auth0 login/signup calls
   - Store token using `setAuthToken()` after successful authentication
   - Handle Auth0 errors appropriately

3. **Token Refresh** (if needed):
   - Implement token refresh logic if tokens expire
   - Update `getAuthToken()` to handle token refresh

## 🔄 Integration Flow

1. **User logs in via Auth0** → Gets access token
2. **Frontend stores token** → `setAuthToken(auth0Token)`
3. **Frontend navigates to home** → `router.push('/home')`
4. **Home page loads** → `useEffect` calls `loadJournals()`
5. **API service adds token to headers** → `Authorization: Bearer <token>`
6. **Backend extracts user_id** → `get_user_id_from_token(request)`
7. **Backend filters by user_id** → Only returns user's journals/logs
8. **Frontend displays user's data** → Journals and logs appear

## 📝 Testing Checklist

Once Auth0 is integrated:

- [ ] User can log in and token is stored
- [ ] Token is sent with all API requests
- [ ] Backend correctly extracts user_id from token
- [ ] User only sees their own journals/logs
- [ ] User cannot access/modify other users' data
- [ ] Token refresh works (if implemented)
- [ ] Logout clears token and redirects to login

## 🚨 Important Notes

1. **Database Migration**: Must run `sql/11_add_user_id_to_journals.sql` in Supabase before testing
2. **Token Validation**: The current implementation decodes tokens without verification (development only). **MUST** be updated for production.
3. **Security**: All endpoints now require authentication. Unauthenticated requests will return 401.
4. **User Isolation**: Each user can only see/modify their own journals and logs.
