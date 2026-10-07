import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface UserPermissions {
  [key: string]: boolean | string[];
}

export type PortalRole = "Patient" | "Doctor";

export interface User {
  id?: string;
  mrn?: string;
  email?: string;
  name?: string;
  fullName?: string;
  role?: PortalRole | "Admin" | string;
  mustChangePassword?: boolean;
  permissions?: string[] | UserPermissions;
  [key: string]: any;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// Initialize state from sessionStorage (not localStorage — tokens must not persist across tabs/sessions)
const getStoredUser = (): User | null => {
  try {
    const stored = sessionStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  } catch (_) {
    return null;
  }
};

const storedUser = getStoredUser();
const storedToken = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("token") : null;

const initialState: AuthState = {
  user: storedUser,
  token: storedToken,
  isAuthenticated: !!(storedUser && storedToken),
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: User; token: string }>) => {
      const { user, token } = action.payload;
      state.user = {
        ...user,
        permissions: user.permissions || [],
      };
      state.token = token;
      state.isAuthenticated = true;

      sessionStorage.setItem("user", JSON.stringify(state.user));
      sessionStorage.setItem("token", token);
    },
    logOut: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;

      sessionStorage.removeItem("user");
      sessionStorage.removeItem("token");
    },
    rehydrateUser: (state) => {
      const user = getStoredUser();
      const token = sessionStorage.getItem("token");

      if (user && token) {
        state.user = user;
        state.token = token;
        state.isAuthenticated = true;
      }
    },
    updateCurrentUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = {
          ...state.user,
          ...action.payload,
        };
        sessionStorage.setItem("user", JSON.stringify(state.user));
      }
    },
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      sessionStorage.setItem("token", action.payload);
    },
  },
});

export const { setCredentials, logOut, rehydrateUser, updateCurrentUser, setAccessToken } =
  authSlice.actions;

export default authSlice.reducer;

export const selectCurrentUser = (state: { auth: AuthState }) => state.auth.user;
export const selectCurrentToken = (state: { auth: AuthState }) => state.auth.token;
export const selectIsAuthenticated = (state: { auth: AuthState }) => state.auth.isAuthenticated;
