/**
 * Email utility — wraps Nodemailer with Gmail SMTP.
 * All sends are fire-and-forget (non-blocking).
 * Set EMAIL_USER and EMAIL_PASS in .env
 */
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password (not your login password)
  },
});

/**
 * Send an email. Never throws — logs errors silently so it never blocks a request.
 * @param {{ to: string, subject: string, html: string }} opts
 */
async function sendEmail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[Email] EMAIL_USER / EMAIL_PASS not set — skipping email to', to);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"PRP Platform" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent "${subject}" → ${to}`);
  } catch (err) {
    console.error('[Email] Failed to send to', to, ':', err.message);
  }
}

// ─── Pre-built templates ──────────────────────────────────────────────────────

function remarkAddedEmail({ menteeName, projectName, phaseName, remark }) {
  return {
    subject: `📝 New Remark on ${phaseName} — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#ec4899;margin-bottom:4px">New Remark Added</h2>
        <p style="color:#6b7280;margin-top:0">Your mentor has reviewed your submission.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Phase</td><td style="padding:8px 0;font-weight:600">${phaseName}</td></tr>
        </table>
        <div style="background:#fdf2f8;border-left:4px solid #ec4899;padding:12px 16px;border-radius:6px;margin:16px 0">
          <p style="margin:0;color:#374151;font-style:italic">"${remark}"</p>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to view your submission.</p>
      </div>`,
  };
}

function finalRemarkEmail({ menteeName, projectName, finalRemark }) {
  return {
    subject: `🎓 Final Evaluation — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#10b981;margin-bottom:4px">Project Evaluation Complete</h2>
        <p style="color:#6b7280;margin-top:0">Your mentor has submitted the final evaluation for your project.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
        </table>
        <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:12px 16px;border-radius:6px;margin:16px 0">
          <p style="margin:0;color:#374151;font-style:italic">"${finalRemark}"</p>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to view your full evaluation.</p>
      </div>`,
  };
}

function deadlineSetEmail({ menteeName, projectName, deadline }) {
  return {
    subject: `📅 Submission Deadline Set — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#f59e0b;margin-bottom:4px">Deadline Set</h2>
        <p style="color:#6b7280;margin-top:0">Your mentor has set a submission deadline for your project.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Deadline</td><td style="padding:8px 0;font-weight:600;color:#f59e0b">${new Date(deadline).toLocaleString()}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to view your dashboard.</p>
      </div>`,
  };
}

function deadlineExtendedEmail({ menteeName, projectName, oldDeadline, newDeadline }) {
  return {
    subject: `⏰ Deadline Extended — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#10b981;margin-bottom:4px">Deadline Extended</h2>
        <p style="color:#6b7280;margin-top:0">Your mentor has extended the submission deadline.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Old Deadline</td><td style="padding:8px 0;text-decoration:line-through;color:#9ca3af">${new Date(oldDeadline).toLocaleString()}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">New Deadline</td><td style="padding:8px 0;font-weight:600;color:#10b981">${new Date(newDeadline).toLocaleString()}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to view your dashboard.</p>
      </div>`,
  };
}

function fileUploadedEmail({ menteeName, menteeEmail, projectName, phaseName }) {
  return {
    subject: `📤 New File Uploaded — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#818cf8;margin-bottom:4px">New Submission Received</h2>
        <p style="color:#6b7280;margin-top:0">A mentee has uploaded a file for your review.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Email</td><td style="padding:8px 0">${menteeEmail}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Phase</td><td style="padding:8px 0;font-weight:600;color:#818cf8">${phaseName}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to review the submission.</p>
      </div>`,
  };
}

function assignmentCreatedMenteeEmail({ menteeName, projectName, mentorEmail }) {
  return {
    subject: `✅ Mentor Assigned — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#ec4899;margin-bottom:4px">You've Been Assigned a Mentor</h2>
        <p style="color:#6b7280;margin-top:0">Your project is now active on PRP Platform.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Mentor</td><td style="padding:8px 0;font-weight:600">${mentorEmail}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to start uploading your files.</p>
      </div>`,
  };
}

function assignmentCreatedMentorEmail({ mentorName, projectName, menteeName, menteeEmail }) {
  return {
    subject: `📋 New Project Assigned to You — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#ec4899;margin-bottom:4px">New Project Assigned</h2>
        <p style="color:#6b7280;margin-top:0">A new mentee project has been assigned to you.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentor</td><td style="padding:8px 0;font-weight:600">${mentorName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Mentee Email</td><td style="padding:8px 0">${menteeEmail}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to view the project.</p>
      </div>`,
  };
}

// ── NEW TEMPLATES ─────────────────────────────────────────────────────────────

function phaseApprovedEmail({ menteeName, projectName, phaseName }) {
  return {
    subject: `✅ Phase Approved — ${phaseName} | ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#10b981;margin-bottom:4px">Phase Approved 🎉</h2>
        <p style="color:#6b7280;margin-top:0">Your mentor has approved your submission.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Phase</td><td style="padding:8px 0;font-weight:600;color:#10b981">${phaseName}</td></tr>
        </table>
        <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:12px 16px;border-radius:6px;margin:16px 0">
          <p style="margin:0;color:#374151">Your <strong>${phaseName}</strong> has been approved. Keep up the great work!</p>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to continue with the next phase.</p>
      </div>`,
  };
}

function mentorChangedOldMentorEmail({ oldMentorName, projectName, menteeName, newMentorEmail }) {
  return {
    subject: `🔄 Project Reassigned — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#f59e0b;margin-bottom:4px">Project Reassigned</h2>
        <p style="color:#6b7280;margin-top:0">A project previously assigned to you has been reassigned by the coordinator.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Previous Mentor</td><td style="padding:8px 0;text-decoration:line-through;color:#9ca3af">${oldMentorName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">New Mentor</td><td style="padding:8px 0;font-weight:600;color:#10b981">${newMentorEmail}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">No further action is required from you.</p>
      </div>`,
  };
}

function mentorChangedNewMentorEmail({ newMentorName, projectName, menteeName, menteeEmail, oldMentorEmail }) {
  return {
    subject: `📋 Project Assigned to You — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#ec4899;margin-bottom:4px">Project Assigned to You</h2>
        <p style="color:#6b7280;margin-top:0">The coordinator has assigned you as the new mentor for this project.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Mentee Email</td><td style="padding:8px 0">${menteeEmail}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Previous Mentor</td><td style="padding:8px 0;color:#9ca3af">${oldMentorEmail}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to review the project submissions.</p>
      </div>`,
  };
}

function mentorChangedMenteeEmail({ menteeName, projectName, oldMentorEmail, newMentorEmail }) {
  return {
    subject: `🔄 Your Mentor Has Changed — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#818cf8;margin-bottom:4px">Mentor Updated</h2>
        <p style="color:#6b7280;margin-top:0">The coordinator has updated your assigned mentor.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:140px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Previous Mentor</td><td style="padding:8px 0;text-decoration:line-through;color:#9ca3af">${oldMentorEmail}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">New Mentor</td><td style="padding:8px 0;font-weight:600;color:#818cf8">${newMentorEmail}</td></tr>
        </table>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform to view your updated dashboard.</p>
      </div>`,
  };
}

function deadlineReminderEmail({ menteeName, projectName, deadline, missingPhases }) {
  const phaseList = missingPhases.map(p => `<li style="margin:4px 0;color:#374151">${p}</li>`).join('');
  return {
    subject: `⚠️ Deadline Reminder — ${projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#f59e0b;margin-bottom:4px">Submission Deadline Approaching</h2>
        <p style="color:#6b7280;margin-top:0">Your project deadline is within 2 days. You have pending phases.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280;width:130px">Mentee</td><td style="padding:8px 0;font-weight:600">${menteeName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Project</td><td style="padding:8px 0;font-weight:600">${projectName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Deadline</td><td style="padding:8px 0;font-weight:600;color:#f59e0b">${new Date(deadline).toLocaleString()}</td></tr>
        </table>
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:16px 0">
          <p style="margin:0 0 8px;font-weight:600;color:#374151">Pending phases:</p>
          <ul style="margin:0;padding-left:20px">${phaseList}</ul>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Log in to PRP Platform immediately to upload your files.</p>
      </div>`,
  };
}

function passwordResetOTPEmail({ userName, otp }) {
  return {
    subject: `🔐 Password Reset OTP — PRP Platform`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#ec4899;margin-bottom:4px">Password Reset Request</h2>
        <p style="color:#6b7280;margin-top:0">You requested to reset your password. Use the OTP below to proceed.</p>
        <div style="background:#fdf2f8;border:2px solid #ec4899;padding:20px;border-radius:12px;margin:24px 0;text-align:center">
          <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px">Your OTP</p>
          <p style="margin:0;font-size:32px;font-weight:bold;color:#ec4899;letter-spacing:4px">${otp}</p>
        </div>
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:16px 0">
          <p style="margin:0;color:#92400e;font-size:13px">⚠️ This OTP is valid for <strong>5 minutes</strong> only.</p>
          <p style="margin:8px 0 0;color:#92400e;font-size:13px">If you didn't request this, please ignore this email.</p>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">For security reasons, never share this OTP with anyone.</p>
      </div>`,
  };
}

module.exports = {
  sendEmail,
  remarkAddedEmail,
  finalRemarkEmail,
  deadlineSetEmail,
  deadlineExtendedEmail,
  fileUploadedEmail,
  assignmentCreatedMenteeEmail,
  assignmentCreatedMentorEmail,
  phaseApprovedEmail,
  mentorChangedOldMentorEmail,
  mentorChangedNewMentorEmail,
  mentorChangedMenteeEmail,
  deadlineReminderEmail,
  passwordResetOTPEmail,
};
