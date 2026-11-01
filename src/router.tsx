import { createBrowserRouter, Link, Navigate } from "react-router";
import { PublicOnly, RequireAuth, RequireNoProfile } from "./components/AuthGuards";
import { Layout } from "./components/Layout";
import { CreateRatingPage } from "./pages/CreateRatingPage";
import { AccessibilityPage } from "./pages/AccessibilityPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { LoginPage } from "./pages/LoginPage";
import { MyProfileRedirect, ProfileRoute } from "./pages/ProfilePage";
import { SecurityPage } from "./pages/SecurityPage";
import { SignUpPage } from "./pages/SignUpPage";
import { TimelinePage } from "./pages/TimelinePage";
import { WelcomePage } from "./pages/WelcomePage";

export const router = createBrowserRouter([
  { path: "/login", element: <PublicOnly><LoginPage /></PublicOnly> },
  { path: "/signup", element: <PublicOnly><SignUpPage /></PublicOnly> },
  { path: "/welcome", element: <RequireNoProfile><WelcomePage /></RequireNoProfile> },
  {
    path: "/",
    // Everything below requires an account; signed-out visitors land on /login.
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <TimelinePage /> },
      { path: "rate", element: <CreateRatingPage /> },
      { path: "discover", element: <DiscoverPage /> },
      { path: "people", element: <Navigate to="/discover" replace /> },
      { path: "profile", element: <MyProfileRedirect /> },
      { path: "u/:handle", element: <ProfileRoute /> },
      { path: "settings/accessibility", element: <AccessibilityPage /> },
      { path: "settings/security", element: <SecurityPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

function NotFound() {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-xl font-extrabold">Page not found.</p>
      <Link to="/" className="btn btn-primary mt-5">
        Back to timeline
      </Link>
    </div>
  );
}
