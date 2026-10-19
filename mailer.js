const nodemailer = require('nodemailer');
const { db, getFormattedNow } = require('./db');
require('dotenv').config();

// Create transporter if SMTP is provided in .env
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Log email to database and attempt sending via SMTP if configured
 */
async function sendNotificationEmail({ to, role, name, subject, htmlContent, taskId = null }) {
  const sentAt = getFormattedNow();
  let status = 'simulasi';

  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"${process.env.APP_NAME || 'Sistem Pemantauan Kerja MDJ'}" <${process.env.SMTP_USER}>`,
        to: to,
        subject: `[MDJ] ${subject}`,
        html: htmlContent,
      });
      status = 'terhantar';
      console.log(`[EMEL TERHANTAR] Kepada: ${to} | Subjek: ${subject}`);
    } catch (err) {
      console.error(`[EMEL RALAT] Gagal hantar ke ${to}:`, err.message);
      status = 'ralat_smtp';
    }
  } else {
    console.log(`[EMEL SIMULASI MDJ] Kepada: ${to} (${name}) | Subjek: ${subject}`);
  }

  // Always log into email_logs table for audit trail & in-app viewer
  try {
    const stmt = db.prepare(`
      INSERT INTO email_logs (recipient_email, recipient_role, recipient_name, subject, body_html, task_id, sent_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(to, role, name, subject, htmlContent, taskId, sentAt, status);
  } catch (err) {
    console.error('Error logging email to DB:', err);
  }

  return { status, sentAt };
}

// Reusable Professional MDJ Email Template
function generateEmailWrapper({ title, badgeText, badgeColor, preheader, contentHtml, actionButton = null }) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
    <div style="display: none; max-height: 0px; overflow: hidden;">${preheader || title}</div>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 24px 0;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
            <!-- Header with MDJ Branding -->
            <tr>
              <td style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #450a0a 100%); padding: 24px 28px; border-bottom: 3px solid #fbbf24;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td width="60" valign="middle">
                      <img src="${baseUrl}/logo-mdj.png" alt="MDJ Logo" width="52" height="52" style="display: block; border-radius: 6px; background-color: #ffffff; padding: 2px;">
                    </td>
                    <td valign="middle" style="padding-left: 14px;">
                      <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #fef08a;">MAJLIS DAERAH JELEBU</span>
                      <h1 style="margin: 4px 0 0 0; font-size: 19px; color: #ffffff; font-weight: 700; letter-spacing: -0.3px;">${title}</h1>
                    </td>
                    ${badgeText ? `
                    <td align="right" valign="middle">
                      <span style="background-color: ${badgeColor || '#0284c7'}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 5px 12px; border-radius: 20px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${badgeText}
                      </span>
                    </td>` : ''}
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding: 28px;">
                ${contentHtml}

                ${actionButton ? `
                <div style="margin: 30px 0 15px 0; text-align: center;">
                  <a href="${actionButton.url}" target="_blank" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.3);">
                    ${actionButton.text}
                  </a>
                  <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b;">
                    Layari portal rasmi: <a href="${baseUrl}" style="color: #0284c7; text-decoration: underline;">${baseUrl}</a>
                  </p>
                </div>
                ` : ''}
              </td>
            </tr>

            <!-- Footer MDJ -->
            <tr>
              <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td>
                      <strong>Sistem Pemantauan Kerja Bersepadu</strong><br>
                      Majlis Daerah Jelebu, Negeri Sembilan Darul Khusus.<br>
                      <span style="font-size: 11px; color: #94a3b8;">Notifikasi ini dijana secara automatik oleh sistem pelayan MDJ.</span>
                    </td>
                    <td align="right" style="font-size: 11px; color: #94a3b8;">
                      Waktu Dijana:<br>
                      ${getFormattedNow()}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

// 1. Notifikasi Tugasan Baru kepada Pegawai
async function notifyTaskAssignedToOfficer(task, officer, kb) {
  const subject = `[TUGASAN BARU] ${task.task_no}: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Arahan Tugasan Baru Diterima',
    badgeText: 'Tugasan Baru',
    badgeColor: '#10b981',
    preheader: `Anda telah menerima arahan tugasan baru daripada Ketua Bahagian: ${task.title}`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${officer.name}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Ketua Bahagian (<strong>${kb.name}</strong>) telah mengagihkan satu arahan tugasan rasmi Majlis Daerah Jelebu kepada anda.
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Rujukan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Lokasi & Tempat</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${task.location} (${task.venue})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tarikh Akhir (Deadline)</td>
          <td style="font-weight: 700; color: #dc2626; border-bottom: 1px solid #e2e8f0;">${task.deadline}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top;">Arahan Tugasan</td>
          <td style="color: #334155; line-height: 1.5;">${task.description}</td>
        </tr>
      </table>
      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #166534; margin-bottom: 20px;">
        <strong>Peringatan Pegawai:</strong> Sila muat naik bukti bergambar di lokasi dan laporan bertulis sebelum atau pada tarikh akhir. Tarikh dan masa sebenar penghantaran akan direkodkan.
      </div>
    `,
    actionButton: {
      text: 'Buka Ruang Kerja & Laksana Tugasan',
      url: `${process.env.BASE_URL || 'http://localhost:3000'}?role=pegawai&user_id=${officer.id}&task_id=${task.id}`
    }
  });

  return sendNotificationEmail({
    to: officer.email,
    role: 'Pegawai',
    name: officer.name,
    subject: subject,
    htmlContent: html,
    taskId: task.id
  });
}

// 2. Notifikasi Agihan Tugasan kepada YDP (Makluman Awal)
async function notifyTaskAssignedToYDP(task, officer, kb, ydp) {
  const subject = `[MAKLUMAN YDP] Agihan Tugasan Baru: ${task.title} (Pegawai: ${officer.name})`;
  const html = generateEmailWrapper({
    title: 'Makluman Agihan Tugasan MDJ',
    badgeText: 'Makluman Eksekutif',
    badgeColor: '#0284c7',
    preheader: `Ketua Bahagian ${kb.name} telah mengagihkan tugasan kepada ${officer.name}`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${ydp.name}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Untuk makluman YBhg. Tuan YDP, satu tugasan baru telah diagihkan di peringkat jabatan Majlis Daerah Jelebu:
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Rujukan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Ketua Bahagian</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${kb.name} (${kb.department})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Pegawai Bertugas</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${officer.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Lokasi / Tempat</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${task.location} - ${task.venue}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tarikh Akhir (Deadline)</td>
          <td style="font-weight: 700; color: #0284c7; border-bottom: 1px solid #e2e8f0;">${task.deadline}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Waktu Agihan Sebenar</td>
          <td style="color: #0f172a; font-weight: 600;">${task.created_at}</td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #64748b;">
        Tugasan kini dipantau dalam Dashboard Eksekutif YDP. Notifikasi seterusnya akan dihantar apabila pegawai menghantar laporan bergambar dan selepas Ketua Bahagian membuat pengesahan rasmi.
      </p>
    `,
    actionButton: {
      text: 'Buka Dashboard Eksekutif YDP',
      url: `${process.env.BASE_URL || 'http://localhost:3000'}?role=ydp`
    }
  });

  return sendNotificationEmail({
    to: ydp.email,
    role: 'YDP',
    name: ydp.name,
    subject: subject,
    htmlContent: html,
    taskId: task.id
  });
}

// 3. Peringatan Tugasan Tamat Hari Ini kepada Pegawai (Kotak Oren)
async function notifyOfficerDueToday(task, officer) {
  const subject = `[PERINGATAN SEGERA] Tugasan Tamat Hari Ini: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Peringatan: Tugasan Tamat Hari Ini',
    badgeText: 'Tamat Hari Ini',
    badgeColor: '#ea580c',
    preheader: `Peringatan: Tugasan ${task.task_no} (${task.title}) perlu disiapkan hari ini!`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${officer.name}</strong>,
      </p>
      <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 14px 16px; border-radius: 4px; font-size: 13px; color: #9a3412; margin-bottom: 20px;">
        <strong>PERINGATAN KOTAK OREN:</strong> Tugasan berikut dijadualkan <strong>TAMAT PADA HARI INI</strong> (${task.deadline}). Sila lengkapkan laporan dan bukti bergambar sebelum waktu pejabat berakhir.
      </div>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Rujukan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Lokasi</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${task.location} (${task.venue})</td>
        </tr>
      </table>
    `,
    actionButton: {
      text: 'Muat Naik Gambar & Hantar Sekarang',
      url: `${process.env.BASE_URL || 'http://localhost:3000'}?role=pegawai&user_id=${officer.id}&task_id=${task.id}`
    }
  });

  return sendNotificationEmail({
    to: officer.email,
    role: 'Pegawai',
    name: officer.name,
    subject: subject,
    htmlContent: html,
    taskId: task.id
  });
}

// 4. Pegawai Telah Menghantar Tugasan -> Notifikasi ke Ketua Bahagian
async function notifyTaskSubmittedToKB(task, officer, kb) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/api/tasks/${task.id}/verify-direct?token=${task.verification_token}`;
  const subject = `[PENGESAHAN DIPERLUKAN] Pegawai Telah Hantar Tugasan: ${task.title}`;

  const html = generateEmailWrapper({
    title: 'Pengesahan Tugasan Diperlukan',
    badgeText: 'Menunggu Pengesahan',
    badgeColor: '#f59e0b',
    preheader: `Pegawai ${officer.name} telah menghantar laporan bagi tugasan ${task.title}`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${kb.name}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Pegawai di bawah seliaan anda (<strong>${officer.name}</strong>) telah menyiapkan tugasan dan menghantar bukti bergambar serta laporan bertulis ke dalam sistem MDJ.
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Tugasan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Waktu Hantar Sebenar</td>
          <td style="font-weight: 700; color: #0284c7; border-bottom: 1px solid #e2e8f0;">${task.submitted_at}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top; border-bottom: 1px solid #e2e8f0;">Laporan Bertulis Pegawai</td>
          <td style="color: #1e293b; line-height: 1.5; border-bottom: 1px solid #e2e8f0; background-color: #ffffff; padding: 10px; border-radius: 6px;">
            ${task.report_text || 'Tiada teks'}
          </td>
        </tr>
      </table>
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; text-align: center; margin: 25px 0;">
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #1e40af; font-weight: 600;">
          Tindakan Pengesahan Ketua Bahagian:
        </p>
        <a href="${verifyUrl}" target="_blank" style="background-color: #16a34a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 24px; border-radius: 6px; display: inline-block; margin-right: 8px;">
          ✓ SAHKAN TUGASAN INI SEKARANG
        </a>
        <a href="${baseUrl}?role=ketua_bahagian&task_id=${task.id}" target="_blank" style="background-color: #475569; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 12px 18px; border-radius: 6px; display: inline-block;">
          Semak Gambar di Portal
        </a>
      </div>
    `
  });

  return sendNotificationEmail({
    to: kb.email,
    role: 'Ketua Bahagian',
    name: kb.name,
    subject: subject,
    htmlContent: html,
    taskId: task.id
  });
}

// 5. Pegawai Telah Menghantar Tugasan -> Notifikasi ke YDP
async function notifyTaskSubmittedToYDP(task, officer, kb, ydp) {
  const subject = `[MAKLUMAN YDP] Pegawai Telah Menghantar Tugasan: ${task.title} (Menunggu Pengesahan KB)`;
  const html = generateEmailWrapper({
    title: 'Makluman: Tugasan Dihantar Pegawai',
    badgeText: 'Menunggu Pengesahan KB',
    badgeColor: '#f59e0b',
    preheader: `Pegawai ${officer.name} telah siap & menghantar tugasan ${task.title}. Status belum disahkan oleh Ketua Bahagian.`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${ydp.name}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Untuk makluman YBhg. Tuan YDP, pegawai telah selesai melaksanakan tugasan di lapangan dan menghantar laporan bertulis serta bukti bergambar ke dalam sistem.
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Tugasan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Pegawai Melaksana</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${officer.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Ketua Bahagian Bertanggungjawab</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${kb.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Waktu Dihantar Sebenar</td>
          <td style="font-weight: 700; color: #0284c7; border-bottom: 1px solid #e2e8f0;">${task.submitted_at}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Status Semasa</td>
          <td>
            <span style="background-color: #fef3c7; color: #92400e; font-weight: 700; padding: 4px 10px; border-radius: 12px; font-size: 12px;">
              Pegawai Dah Hantar (Ketua Bahagian Belum Sahkan)
            </span>
          </td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #64748b;">
        Emel notifikasi pengesahan lengkap dengan tarikh dan masa sebenar akan dihantar kepada YDP sebaik sahaja Ketua Bahagian meneliti dan mengesahkan tugasan ini.
      </p>
    `,
    actionButton: {
      text: 'Semak Status di Dashboard YDP',
      url: `${process.env.BASE_URL || 'http://localhost:3000'}?role=ydp`
    }
  });

  return sendNotificationEmail({
    to: ydp.email,
    role: 'YDP',
    name: ydp.name,
    subject: subject,
    htmlContent: html,
    taskId: task.id
  });
}

// 6. Ketua Bahagian Sahkan Tugasan -> Notifikasi Rasmi ke YDP
async function notifyTaskVerifiedToYDP(task, officer, kb, ydp) {
  const subject = `[SELESAI] Ketua Bahagian Telah Sahkan Tugasan: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Pengesahan Penuh: Tugasan Telah Disahkan',
    badgeText: 'Disahkan Selesai',
    badgeColor: '#16a34a',
    preheader: `Ketua Bahagian ${kb.name} telah mengesahkan tugasan ${task.title} pada ${task.verified_at}`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${ydp.name}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Untuk makluman YBhg. Tuan YDP, Ketua Bahagian telah selesai membuat semakan dan <strong>MENGESAHKAN</strong> tugasan berikut:
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Tugasan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Pegawai Bertugas</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${officer.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Ketua Bahagian Pengesah</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${kb.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tarikh & Masa Hantar Pegawai</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${task.submitted_at}</td>
        </tr>
        <tr style="background-color: #ecfdf5;">
          <td style="color: #065f46; font-weight: 700; border-bottom: 1px solid #a7f3d0;">Tarikh &amp; Masa Sebenar Disahkan</td>
          <td style="font-weight: 700; color: #047857; font-size: 14px; border-bottom: 1px solid #a7f3d0;">
            ${task.verified_at}
          </td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top;">Catatan Pengesahan KB</td>
          <td style="color: #334155; font-style: italic;">
            ${task.verification_notes ? `"${task.verification_notes}"` : 'Disahkan lengkap dan memuaskan.'}
          </td>
        </tr>
      </table>
      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #166534; margin-bottom: 10px;">
        <strong>Audit Trail Lengkap:</strong> Kitaran tugasan ini telah selesai sepenuhnya dengan rekod tarikh dan masa yang disahkan.
      </div>
    `,
    actionButton: {
      text: 'Buka Dashboard YDP untuk Rekod Penuh',
      url: `${process.env.BASE_URL || 'http://localhost:3000'}?role=ydp`
    }
  });

  return sendNotificationEmail({
    to: ydp.email,
    role: 'YDP',
    name: ydp.name,
    subject: subject,
    htmlContent: html,
    taskId: task.id
  });
}

// 7. Notifikasi kepada Pegawai
async function notifyTaskVerifiedToOfficer(task, officer, kb) {
  const subject = `[STATUS TUGASAN] Tugasan Disahkan: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Tugasan Anda Telah Disahkan',
    badgeText: 'Disahkan',
    badgeColor: '#16a34a',
    preheader: `Ketua Bahagian telah mengesahkan tugasan ${task.title}`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${officer.name}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Tugasan anda (<strong>${task.title}</strong>) telah disemak dan <strong>DISAHKAN</strong> oleh Ketua Bahagian (<strong>${kb.name}</strong>) pada <strong>${task.verified_at}</strong>.
      </p>
      <p style="font-size: 13px; color: #64748b;">
        Terima kasih atas komitmen anda. Rekod telah dikemas kini ke dalam rekod YDP Majlis Daerah Jelebu.
      </p>
    `
  });

  return sendNotificationEmail({
    to: officer.email,
    role: 'Pegawai',
    name: officer.name,
    subject: subject,
    htmlContent: html,
    taskId: task.id
  });
}

module.exports = {
  sendNotificationEmail,
  notifyTaskAssignedToOfficer,
  notifyTaskAssignedToYDP,
  notifyOfficerDueToday,
  notifyTaskSubmittedToKB,
  notifyTaskSubmittedToYDP,
  notifyTaskVerifiedToYDP,
  notifyTaskVerifiedToOfficer
};
