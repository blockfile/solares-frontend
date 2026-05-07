import { Navigate } from "react-router-dom";
import { getAuthToken } from "./tokenStorage";

export default function RequireAuth({ children }) {
    const token = getAuthToken();
    if (!token) return <Navigate to="/login" replace />;
    return children;
}
