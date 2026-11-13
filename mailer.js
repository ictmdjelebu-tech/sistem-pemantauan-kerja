const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { getFormattedNow, db } = require('./db');
require('dotenv').config();

// Determine Base URL: Fall back to live Render URL instead of localhost
const defaultBaseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://sistem-pemantauan-kerja.onrender.com';

// Cache MDJ Logo as Base64 Data URI so it displays 100% reliably in emails & web previews
let logoDataUri = null;
try {
  const logoPath = path.join(__dirname, 'public', 'logo-mdj.png');
  if (fs.existsSync(logoPath)) {
    const buf = fs.readFileSync(logoPath);
    logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
  }
} catch (e) {
  console.error('Peringatan: Gagal memuatkan logo-mdj.png:', e.message);
}

// Nodemailer Transporter Configuration (SMTP)
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
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
    db.run(
      'INSERT INTO email_logs (recipient_email, recipient_role, recipient_name, subject, body_html, task_id, sent_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [to, role, name, subject, htmlContent, taskId, sentAt, status]
    ).catch(err => console.error('Error logging email to DB:', err));
  } catch (err) {
    console.error('Error logging email to DB:', err);
  }

  return { status, sentAt };
}

// Reusable Professional MDJ Email Template
function generateEmailWrapper({ title, badgeText, badgeColor, preheader, contentHtml, actionButton = null }) {
  const baseUrl = defaultBaseUrl;
  const logoSrc = logoDataUri || `${baseUrl}/logo-mdj.png`;

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
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 20px 0;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
            <!-- Header with MDJ Branding -->
            <tr>
              <td style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #450a0a 100%); padding: 22px 26px; border-bottom: 3px solid #fbbf24;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td width="58" valign="middle">
                      <img src="${logoSrc}" alt="MDJ Logo" width="50" height="50" style="display: block; border-radius: 8px; background-color: #ffffff; padding: 2px;">
                    </td>
                    <td valign="middle" style="padding-left: 14px;">
                      <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #fef08a;">MAJLIS DAERAH JELEBU</span>
                      <h1 style="margin: 4px 0 0 0; font-size: 18px; color: #ffffff; font-weight: 700; letter-spacing: -0.3px;">${title}</h1>
                    </td>
                    ${badgeText ? `
                    <td align="right" valign="middle">
                      <span style="background-color: ${badgeColor || '#0284c7'}; color: #ffffff; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 20px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${badgeText}
                      </span>
                    </td>` : ''}
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding: 24px 26px;">
                ${contentHtml}

                ${actionButton ? `
                <div style="margin: 28px 0 14px 0; text-align: center;">
                  <a href="${actionButton.url}" target="_blank" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 13px 26px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.3);">
                    ${actionButton.text}
                  </a>
                  <p style="margin: 10px 0 0 0; font-size: 11px; color: #64748b;">
                    Layari portal rasmi: <a href="${baseUrl}" style="color: #0284c7; text-decoration: underline;">${baseUrl}</a>
                  </p>
                </div>` : ''}

                <!-- Official Footer Note -->
                <div style="margin-top: 30px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5;">
                  Emel ini dijana secara automatik oleh <strong>Sistem Pemantauan Kerja Bersepadu Majlis Daerah Jelebu</strong>.<br>
                  Sila jangan balas emel ini. Sebarang pertanyaan hubungi Bahagian Teknologi Maklumat & Pentadbiran MDJ.
                </div>
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

// 1. Agihan Tugasan Baru -> Notifikasi ke Pegawai
async function notifyTaskAssignedToOfficer(task, officer, kb) {
  const subject = `[TUGASAN BARU MDJ] ${task.task_no}: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Tugasan Baru Diberikan',
    badgeText: 'Tugasan Baru',
    badgeColor: '#0284c7',
    preheader: `Ketua Bahagian ${kb.name} telah memberikan tugasan baru: ${task.title}. Tarikh akhir: ${task.deadline}.`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${officer.name}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Anda telah diberikan satu tugasan baru oleh Ketua Bahagian anda (<strong>${kb.name}</strong>). Sila laksanakan tugasan ini sebelum tarikh akhir yang ditetapkan.
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Rujukan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 700; color: #b91c1c; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Pemberi Tugasan</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${kb.name} (${kb.department})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Lokasi / Tempat</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${task.location} (${task.venue})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tarikh Akhir (Deadline)</td>
          <td style="font-weight: 700; color: #dc2626; border-bottom: 1px solid #e2e8f0;">${task.deadline}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top;">Perincian Tugasan</td>
          <td style="color: #334155; line-height: 1.5;">${task.description}</td>
        </tr>
      </table>
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 18px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 12px; color: #065f46;">
          <strong>Peringatan SLA:</strong> Status tugasan ini kini berada dalam <strong>KOTAK HIJAU</strong> (Dalam Tempoh). Sila muat naik sekurang-kurangnya 1 gambar bukti dan laporan bertulis sebelum tarikh akhir untuk mengelakkan status bertukar ke <strong>KOTAK OREN</strong> atau <strong>KOTAK MERAH</strong>.
        </p>
      </div>
    `,
    actionButton: {
      text: 'Buka Portal & Hantar Laporan',
      url: `${defaultBaseUrl}?role=pegawai&user_id=${officer.id}&task_id=${task.id}`
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

// 2. Agihan Tugasan Baru -> Makluman Awal ke YDP & SU
async function notifyTaskAssignedToYDP(task, officer, kb, ydp, su = null) {
  const subject = `[MAKLUMAN MDJ] Agihan Tugasan Baru: ${task.title} (Pegawai: ${officer.name})`;
  const html = generateEmailWrapper({
    title: 'Makluman Agihan Tugasan MDJ',
    badgeText: 'Makluman Eksekutif',
    badgeColor: '#0284c7',
    preheader: `Ketua Bahagian ${kb.name} telah mengagihkan tugasan baru kepada ${officer.name}.`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>Pengurusan Eksekutif Majlis Daerah Jelebu</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Untuk makluman pihak pengurusan, satu tugasan baru telah diagihkan di peringkat jabatan Majlis Daerah Jelebu:
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
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
          <td style="font-weight: 600; color: #0284c7; border-bottom: 1px solid #e2e8f0;">${officer.name}</td>
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
          <td style="color: #64748b; font-mono font-size: 12px;">${task.created_at}</td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        Tugasan kini dipantau dalam Dashboard Eksekutif. Notifikasi seterusnya akan dihantar apabila pegawai menghantar laporan bergambar dan selepas Ketua Bahagian membuat pengesahan rasmi.
      </p>
    `,
    actionButton: {
      text: 'Buka Dashboard Eksekutif',
      url: `${defaultBaseUrl}?role=ydp&task_id=${task.id}`
    }
  });

  if (ydp && ydp.email) {
    sendNotificationEmail({
      to: ydp.email,
      role: 'YDP',
      name: ydp.name,
      subject: subject,
      htmlContent: html,
      taskId: task.id
    });
  }

  if (su && su.email) {
    sendNotificationEmail({
      to: su.email,
      role: 'Setiausaha',
      name: su.name,
      subject: subject,
      htmlContent: html,
      taskId: task.id
    });
  }
}

// 3. Kotak Oren: Peringatan Tamat Tempoh Hari Ini
async function notifyOfficerDueToday(task, officer) {
  const subject = `[PERINGATAN SEGERA] Tugasan Tamat Hari Ini: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Peringatan: Tamat Tempoh Hari Ini',
    badgeText: 'Kotak Oren (Hari Ini)',
    badgeColor: '#f97316',
    preheader: `PERINGATAN: Tugasan ${task.task_no} (${task.title}) perlu dihantar selewat-lewatnya hari ini!`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>${officer.name}</strong>,
      </p>
      <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 14px; margin: 15px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 6px 0; color: #c2410c; font-size: 15px;">Tugasan Berada Dalam Status KOTAK OREN</h3>
        <p style="margin: 0; font-size: 13px; color: #9a3412;">
          Hari ini adalah tarikh akhir pelaksanaan bagi tugasan: <strong>${task.title}</strong> (${task.task_no}).
        </p>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Sila muat naik laporan bertulis ringkas dan bukti bergambar sebelum jam 11:59 malam ini. Sekiranya tidak dihantar hari ini, status tugasan akan automatik bertukar ke <strong>KOTAK MERAH (Tertunggak)</strong> dan direkodkan ke dalam laporan audit kelewatan.
      </p>
    `,
    actionButton: {
      text: 'Muat Naik Laporan & Bukti Sekarang',
      url: `${defaultBaseUrl}?role=pegawai&user_id=${officer.id}&task_id=${task.id}`
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
  const verifyUrl = `${defaultBaseUrl}/api/tasks/${task.id}/verify-direct?token=${task.verification_token}`;
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
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
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
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; text-align: center; margin: 22px 0;">
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #1e40af; font-weight: 600;">
          Tindakan Pengesahan Ketua Bahagian:
        </p>
        <a href="${verifyUrl}" target="_blank" style="background-color: #16a34a; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 11px 22px; border-radius: 6px; display: inline-block; margin: 4px;">
          ✓ SAHKAN TUGASAN INI SEKARANG
        </a>
        <a href="${defaultBaseUrl}?role=ketua_bahagian&task_id=${task.id}" target="_blank" style="background-color: #475569; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 11px 18px; border-radius: 6px; display: inline-block; margin: 4px;">
          Semak Gambar & Ulasan di Portal
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

// 5. Pegawai Telah Menghantar Tugasan -> Notifikasi ke YDP & SU
async function notifyTaskSubmittedToYDP(task, officer, kb, ydp, su = null) {
  const subject = `[MAKLUMAN MDJ] Pegawai Telah Menghantar Tugasan: ${task.title} (Menunggu Pengesahan KB)`;
  const html = generateEmailWrapper({
    title: 'Makluman: Tugasan Dihantar Pegawai',
    badgeText: 'Menunggu Pengesahan KB',
    badgeColor: '#f59e0b',
    preheader: `Pegawai ${officer.name} telah siap & menghantar tugasan ${task.title}. Status belum disahkan oleh Ketua Bahagian.`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>Pengurusan Eksekutif Majlis Daerah Jelebu</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Untuk makluman pihak pengurusan, pegawai di bawah seliaan <strong>${kb.name}</strong> telah memuat naik laporan dan bukti tugasan berikut:
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
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
          <td style="color: #0284c7; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${officer.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Ketua Bahagian</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${kb.name} (${kb.department})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tarikh Hantar Sebenar</td>
          <td style="font-weight: 700; color: #16a34a; border-bottom: 1px solid #e2e8f0;">${task.submitted_at}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top;">Laporan Pegawai</td>
          <td style="color: #334155; line-height: 1.5;">${task.report_text || 'Tiada teks'}</td>
        </tr>
      </table>
      <div style="background-color: #fefce8; border: 1px solid #fef08a; padding: 12px; border-radius: 6px; font-size: 13px; color: #854d0e;">
        <strong>Status Semasa:</strong> Tugasan sedang menunggu semakan dan pengesahan rasmi daripada Ketua Bahagian. Pihak YDP dan Setiausaha boleh memberikan ulasan eksekutif pada bila-bila masa melalui portal.
      </div>
    `,
    actionButton: {
      text: 'Semak Bukti & Beri Ulasan Eksekutif',
      url: `${defaultBaseUrl}?role=ydp&task_id=${task.id}`
    }
  });

  if (ydp && ydp.email) {
    sendNotificationEmail({
      to: ydp.email,
      role: 'YDP',
      name: ydp.name,
      subject: subject,
      htmlContent: html,
      taskId: task.id
    });
  }

  if (su && su.email) {
    sendNotificationEmail({
      to: su.email,
      role: 'Setiausaha',
      name: su.name,
      subject: subject,
      htmlContent: html,
      taskId: task.id
    });
  }
}

// 6. Ketua Bahagian Sahkan Tugasan -> Emel Pengesahan Rasmi kepada YDP & SU
async function notifyTaskVerifiedToYDP(task, officer, kb, ydp, su = null) {
  const subject = `[PENGESAHAN RASMI] Tugasan ${task.task_no} Telah Disahkan: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Pengesahan Rasmi Tugasan MDJ',
    badgeText: 'Disahkan Selesai',
    badgeColor: '#16a34a',
    preheader: `Ketua Bahagian ${kb.name} telah mengesahkan bahawa tugasan ${task.title} telah selesai dilaksanakan.`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat <strong>Pengurusan Eksekutif Majlis Daerah Jelebu</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Sukacita dimaklumkan bahawa tugasan berikut telah <strong>DISAHKAN SELESAI</strong> oleh Ketua Bahagian bertanggungjawab:
      </p>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 18px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
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
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Disahkan Oleh (KB)</td>
          <td style="color: #0284c7; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${kb.name} (${kb.department})</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tarikh &amp; Masa Sah</td>
          <td style="font-weight: 700; color: #16a34a; border-bottom: 1px solid #e2e8f0;">${task.verified_at}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; vertical-align: top;">Catatan Pengesahan KB</td>
          <td style="color: #1e293b; line-height: 1.5;">${task.verification_notes || 'Disahkan lengkap dan teratur.'}</td>
        </tr>
      </table>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; font-size: 13px; color: #166534;">
        ✓ Tugasan telah direkodkan sebagai <strong>SELESAI (KOTAK KELABU)</strong> dalam pangkalan data MDJ.
      </div>
    `,
    actionButton: {
      text: 'Buka Dashboard Eksekutif',
      url: `${defaultBaseUrl}?role=ydp&task_id=${task.id}`
    }
  });

  if (ydp && ydp.email) {
    sendNotificationEmail({
      to: ydp.email,
      role: 'YDP',
      name: ydp.name,
      subject: subject,
      htmlContent: html,
      taskId: task.id
    });
  }

  if (su && su.email) {
    sendNotificationEmail({
      to: su.email,
      role: 'Setiausaha',
      name: su.name,
      subject: subject,
      htmlContent: html,
      taskId: task.id
    });
  }
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
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 15px 0; font-size: 13px;">
        <strong>Catatan Pengesahan:</strong> ${task.verification_notes || 'Disahkan lengkap dan teratur.'}
      </div>
      <p style="font-size: 13px; color: #64748b;">
        Terima kasih atas komitmen anda. Rekod telah dikemas kini ke dalam rekod Majlis Daerah Jelebu.
      </p>
    `,
    actionButton: {
      text: 'Lihat Status Tugasan di Portal',
      url: `${defaultBaseUrl}?role=pegawai&user_id=${officer.id}&task_id=${task.id}`
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

// 8. Ulasan YDP Ditambah -> Notifikasi kepada Pegawai, KB & Setiausaha
async function notifyTaskYdpRemark(task, officer, kb, ydp, su = null) {
  const subject = `[ULASAN YDP MDJ] Tugasan ${task.task_no}: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Ulasan Eksekutif Yang Dipertua (YDP)',
    badgeText: 'Ulasan YDP',
    badgeColor: '#d97706',
    preheader: `Yang Dipertua (YDP) Majlis Daerah Jelebu telah merekodkan ulasan bagi tugasan ${task.title}.`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat warga kerja <strong>Majlis Daerah Jelebu</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Yang Dipertua (YDP) Majlis Daerah Jelebu telah memberikan ulasan dan arahan eksekutif ke atas tugasan berikut:
      </p>
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #d97706; border-radius: 8px; padding: 14px; margin: 18px 0;">
        <div style="font-size: 12px; color: #92400e; font-weight: 700; margin-bottom: 6px;">
          ULASAN YANG DIPERTUA (YDP) [${task.ydp_noted_at || getFormattedNow()}]:
        </div>
        <div style="font-size: 14px; color: #78350f; font-weight: 600; line-height: 1.6; font-style: italic;">
          "${task.ydp_notes || ''}"
        </div>
      </div>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 15px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Tugasan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Ketua Bahagian</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${kb ? kb.name : '-'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Pegawai Bertugas</td>
          <td style="color: #0284c7; font-weight: 600;">${officer ? officer.name : '-'}</td>
        </tr>
      </table>
    `,
    actionButton: {
      text: 'Buka Tugasan di Portal Rasmi',
      url: `${defaultBaseUrl}?task_id=${task.id}`
    }
  });

  if (officer && officer.email) {
    sendNotificationEmail({ to: officer.email, role: 'Pegawai', name: officer.name, subject, htmlContent: html, taskId: task.id });
  }
  if (kb && kb.email) {
    sendNotificationEmail({ to: kb.email, role: 'Ketua Bahagian', name: kb.name, subject, htmlContent: html, taskId: task.id });
  }
  if (su && su.email) {
    sendNotificationEmail({ to: su.email, role: 'Setiausaha', name: su.name, subject, htmlContent: html, taskId: task.id });
  }
}

// 9. Ulasan Setiausaha Ditambah -> Notifikasi kepada Pegawai, KB & YDP
async function notifyTaskSuRemark(task, officer, kb, ydp, su = null) {
  const subject = `[ULASAN SETIAUSAHA MDJ] Tugasan ${task.task_no}: ${task.title}`;
  const html = generateEmailWrapper({
    title: 'Ulasan Setiausaha (SU) Majlis',
    badgeText: 'Ulasan Setiausaha',
    badgeColor: '#2563eb',
    preheader: `Setiausaha Majlis Daerah Jelebu telah merekodkan ulasan bagi tugasan ${task.title}.`,
    contentHtml: `
      <p style="font-size: 15px; line-height: 1.6; margin-top: 0;">
        Salam hormat warga kerja <strong>Majlis Daerah Jelebu</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Setiausaha (SU) Majlis Daerah Jelebu telah memberikan ulasan dan arahan pentadbiran ke atas tugasan berikut:
      </p>
      <div style="background-color: #eff6ff; border: 1px solid #dbeafe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px; margin: 18px 0;">
        <div style="font-size: 12px; color: #1e40af; font-weight: 700; margin-bottom: 6px;">
          ULASAN SETIAUSAHA (SU) [${task.su_noted_at || getFormattedNow()}]:
        </div>
        <div style="font-size: 14px; color: #1e3a8a; font-weight: 600; line-height: 1.6; font-style: italic;">
          "${task.su_notes || ''}"
        </div>
      </div>
      <table border="0" cellpadding="8" cellspacing="0" width="100%" style="margin: 15px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <tr>
          <td width="30%" style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">No. Tugasan</td>
          <td style="font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.task_no}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Tajuk Tugasan</td>
          <td style="font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${task.title}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Ketua Bahagian</td>
          <td style="color: #334155; border-bottom: 1px solid #e2e8f0;">${kb ? kb.name : '-'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600;">Pegawai Bertugas</td>
          <td style="color: #0284c7; font-weight: 600;">${officer ? officer.name : '-'}</td>
        </tr>
      </table>
    `,
    actionButton: {
      text: 'Buka Tugasan di Portal Rasmi',
      url: `${defaultBaseUrl}?task_id=${task.id}`
    }
  });

  if (officer && officer.email) {
    sendNotificationEmail({ to: officer.email, role: 'Pegawai', name: officer.name, subject, htmlContent: html, taskId: task.id });
  }
  if (kb && kb.email) {
    sendNotificationEmail({ to: kb.email, role: 'Ketua Bahagian', name: kb.name, subject, htmlContent: html, taskId: task.id });
  }
  if (ydp && ydp.email) {
    sendNotificationEmail({ to: ydp.email, role: 'YDP', name: ydp.name, subject, htmlContent: html, taskId: task.id });
  }
}

module.exports = {
  sendNotificationEmail,
  notifyTaskAssignedToOfficer,
  notifyTaskAssignedToYDP,
  notifyOfficerDueToday,
  notifyTaskSubmittedToKB,
  notifyTaskSubmittedToYDP,
  notifyTaskVerifiedToYDP,
  notifyTaskVerifiedToOfficer,
  notifyTaskYdpRemark,
  notifyTaskSuRemark
};
