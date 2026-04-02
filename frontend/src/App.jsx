import React from 'react';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import Banner from './components/Banner';
import CompleteProfile from './components/CompleteProfile';
import EmailVerify from './components/EmailVerify';
import Footer from './components/Footer';
import ForgotPassword from './components/ForgotPassword';
import GoogleCallback from './components/GoogleCallback';
import GoogleLogin from './components/GoogleLogin';
import HODDashboard from './components/HODDashboard';
import Login from './components/Login';
import MenteeDashboard from './components/MenteeDashboard';
import MentorDashboard from './components/MentorDashboard';
import Navbar from './components/Navbar';
import ProjectCoordinatorDashboard from './components/ProjectCoordinatorDashboard';
import Signup from './components/Signup';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<><Navbar /><Banner /><Footer /></>} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/google-login" element={<GoogleLogin />} />
        <Route path="/auth/callback" element={<GoogleCallback />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
        <Route path="/verify/:token" element={<EmailVerify />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/mentee-dashboard" element={<MenteeDashboard />} />
        <Route path="/mentor-dashboard" element={<MentorDashboard />} />
        <Route path="/project-coordinator-dashboard" element={<ProjectCoordinatorDashboard />} />
        <Route path="/hod-dashboard" element={<HODDashboard />} /> 
      </Routes>
    </Router>
  );
}

export default App;