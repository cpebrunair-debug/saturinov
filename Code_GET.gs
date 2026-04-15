/**
 * ═══════════════════════════════════════════════════════════════════
 *  CESGS PROJECT HUB — Google Apps Script
 * ═══════════════════════════════════════════════════════════════════
 *  Spreadsheet ID diambil otomatis dari file aktif.
 *  Deploy → New Deployment → Web App
 *    Execute as : Me
 *    Who access : Anyone
 * ═══════════════════════════════════════════════════════════════════
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── doGET — return all data as structured JSON ───────────────────────────────
/**
 * Called by: fetch(GAS_URL + '?action=getData')
 * Returns the full state object matching the HTML's data model.
 */
function doGet(e) {
  try {
    const params   = e && e.parameter ? e.parameter : {};
    const action   = params.action   || 'getData';
    const callback = params.callback || '';   // JSONP callback name

    let result;
    if (action === 'getSheet') {
      const data = readSheet(params.sheet);
      result = { ok: true, sheet: params.sheet, data };
    } else {
      const state = buildFullState();
      result = { ok: true, data: state };
    }

    const json = JSON.stringify(result);

    if (callback) {
      // ── JSONP mode ── tidak ada CORS restriction, bisa dari file://
      return ContentService
        .createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    // ── Normal JSON mode ──
    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    const errJson = JSON.stringify({ ok: false, error: err.message });
    const callback = e && e.parameter && e.parameter.callback;
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + errJson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService
      .createTextOutput(errJson)
      .setMimeType(ContentService.MimeType.JSON);
  }
}



// ═══════════════════════════════════════════════════════════════════
//  BUILD FULL STATE  (maps all sheets → HTML state object)
// ═══════════════════════════════════════════════════════════════════
function buildFullState() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── Raw sheet reads ──────────────────────────────────────────────
  const projectsRaw    = readSheet('Projects');
  const metaRaw        = readSheet('ProjectMeta');
  const partnersRaw    = readSheet('Partners');
  const collabRaw      = readSheet('Collaborators');
  const clientsRaw     = readSheet('Clients');
  const adminsRaw      = readSheet('Admins');
  const docsRaw        = readSheet('Documents');
  const momsRaw        = readSheet('MoMs');
  const momActionsRaw  = readSheet('MoM_Actions');
  const momDecsRaw     = readSheet('MoM_Decisions');
  const meetingsRaw    = readSheet('Meetings');
  const calEventsRaw   = readSheet('CalendarEvents');
  const calNotesRaw    = readSheet('CalNotes');
  const timelineRaw    = readSheet('Timeline');
  const tasksRaw       = readSheet('Tasks');
  const bookingRaw     = readSheet('BookingRequests');
  const availabilityRaw= readSheet('Availability');
  const blockedRaw     = readSheet('BlockedDates');
  const messagesRaw    = readSheet('Messages');
  const notifsRaw      = readSheet('Notifications');
  const orgInfoRaw     = readSheet('OrgInfo');

  // ── OrgInfo ──────────────────────────────────────────────────────
  const orgMap = {};
  orgInfoRaw.forEach(r => { if (r.field) orgMap[r.field] = r.value; });

  // ── Availability ──────────────────────────────────────────────────
  const avMap = {};
  availabilityRaw.forEach(r => { if (r.config_key) avMap[r.config_key] = r.value; });
  const availability = {
    start:    avMap['booking_start'] || '08:00',
    end:      avMap['booking_end']   || '16:30',
    weekdays: (avMap['weekdays'] || '1,2,3,4,5').split(',').map(Number),
    durations:(avMap['durations'] || '30,60,90').split(',').map(Number),
    blockedDates: blockedRaw.map(r => ({
      date: r.date || '',
      type: r.type || 'blocked',
      note: r.note || '',
    })).filter(r => r.date),
  };

  // ── Projects (keyed by project_id) ───────────────────────────────
  const projects = {};
  projectsRaw.forEach(p => {
    if (!p.project_id) return;
    const meta = metaRaw.find(m => m.project_id === p.project_id) || {};
    projects[p.project_id] = {
      id:          p.project_id,
      name:        p.name,
      org:         p.org,
      password:    p.password,
      accent:      p.accent_color || '#0B8C7A',
      icon:        p.icon_emoji   || '📁',
      desc:        p.description  || '',
      status:      p.status       || 'active',
      drive:       p.drive_url    || '',
      meet:        p.meet_url     || '',
      createdAt:   p.created_at   || '',
      // ProjectMeta extras
      lastUpdate:  meta.last_update || '',
      estimatedDeadline: meta.estimated_deadline || '',
      summary:     meta.summary   || '',
    };
  });

  // ── Clients ───────────────────────────────────────────────────────
  const clients = clientsRaw.map(c => ({
    id:        c.client_id,
    name:      c.name,
    email:     c.email,
    password:  c.password,
    org:       c.organization || '',
    projects:  c.project_access ? c.project_access.split(',').map(s => s.trim()).filter(Boolean) : [],
    status:    c.status || 'active',
    cvDesc:    c.cv_desc || '',
    profileLink: c.profile_link || '',
    photoUrl:  c.photo_url || '',
    createdAt: c.created_at || '',
  }));

  // ── Admins ────────────────────────────────────────────────────────
  const admins = adminsRaw.map(a => ({
    id:        a.admin_id,
    name:      a.name,
    email:     a.email,
    password:  a.password,
    role:      a.role || 'admin',
    projects:  a.project_access ? a.project_access.split(',').map(s => s.trim()).filter(Boolean) : [],
    isPrimary: String(a.is_primary).toUpperCase() === 'TRUE',
    createdAt: a.created_at || '',
  }));

  // ── Booking Requests ──────────────────────────────────────────────
  const bookingRequests = bookingRaw.map(r => ({
    id:            r.request_id,
    name:          r.name,
    email:         r.email,
    org:           r.organization || '',
    project:       r.project_id,
    duration:      Number(r.duration_min) || 60,
    agenda:        r.agenda,
    preferences:   buildPreferences(r),
    status:        r.status || 'requested',
    submittedAt:   r.submitted_at || '',
    confirmedDate: r.confirmed_date || '',
    confirmedTime: r.confirmed_time || '',
  }));

  // ── Meetings ──────────────────────────────────────────────────────
  const meetings = meetingsRaw.map(m => ({
    id:          m.meeting_id,
    title:       m.title,
    projectId:   m.project_id,
    date:        m.date,
    time:        m.time_range,
    duration:    Number(m.duration_min) || 60,
    location:    m.location,
    agenda:      m.agenda,
    attendees:   m.attendees ? m.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
    status:      m.status || 'confirmed',
    fromRequest: m.from_request_id || '',
  }));

  // ── SuperAdmin & OrgInfo ──────────────────────────────────────────
  const superAdmin = {
    email:    orgMap['superadmin_email']    || 'info@cesgs.or.id',
    password: orgMap['superadmin_password'] || 'CESGS2026',
    name:     orgMap['org_name']            || 'Super Admin CESGS',
  };
  const orgInfo = {
    name:  orgMap['org_name']  || 'Applied Research CESGS',
    sub:   orgMap['sub_title'] || '',
    email: orgMap['contact_email'] || '',
  };

  // ── Per-project hub data (cesgs_hub_data) ─────────────────────────
  const hubData = {};
  Object.keys(projects).forEach(pid => {
    hubData[pid] = {
      partners: partnersRaw
        .filter(p => p.project_id === pid)
        .map(p => ({ name: p.partner_name, note: p.note || '' })),

      collaborators: collabRaw
        .filter(c => c.project_id === pid)
        .map(c => ({ email: c.email, role: c.role || 'viewer', addedAt: c.added_at || '' })),

      documents: docsRaw
        .filter(d => d.project_id === pid)
        .map(d => ({
          id:     d.doc_id,
          title:  d.title,
          cat:    d.category || '',
          url:    d.url,
          desc:   d.description || '',
          author: d.author || '',
          date:   d.date || '',
        })),

      moms: momsRaw
        .filter(m => m.project_id === pid)
        .map(m => ({
          id:         m.mom_id,
          projectId:  m.project_id,
          title:      m.title,
          date:       m.date,
          time:       m.time || '',
          location:   m.location || '',
          attendees:  m.attendees ? m.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
          summary:    m.summary || '',
          nextSteps:  m.next_steps || '',
          actions: momActionsRaw
            .filter(a => String(a.mom_id) === String(m.mom_id))
            .map(a => ({
              id:       a.action_id,
              text:     a.action_text,
              owner:    a.owner || '',
              deadline: a.deadline || '',
              done:     String(a.done).toUpperCase() === 'TRUE',
            })),
          decisions: momDecsRaw
            .filter(d => String(d.mom_id) === String(m.mom_id))
            .map(d => ({
              id:   d.decision_id,
              text: d.decision_text,
            })),
        })),

      meetings: meetings.filter(m => m.projectId === pid),

      calendarEvents: calEventsRaw
        .filter(e => e.project_id === pid)
        .map(e => ({
          id:          e.event_id,
          projectId:   e.project_id,
          owner:       e.owner || '',
          ownerEmail:  e.owner_email || '',
          title:       e.title,
          mode:        e.mode || 'overlap',
          date:        e.date,
          startTime:   e.start_time || '',
          endTime:     e.end_time || '',
          source:      e.source || 'manual',
        })),

      calNotes: (() => {
        const obj = {};
        calNotesRaw
          .filter(n => n.project_id === pid)
          .forEach(n => { if (n.date) obj[n.date] = n.note; });
        return obj;
      })(),

      timeline: timelineRaw
        .filter(t => t.project_id === pid)
        .map(t => ({
          id:        t.timeline_id,
          projectId: t.project_id,
          title:     t.title,
          type:      t.type || 'activity',
          status:    t.status || 'planned',
          date:      t.date || '',
          updatedAt: t.updated_at || '',
          deadline:  t.deadline || '',
          note:      t.note || '',
          picEmails: t.pic_emails ? t.pic_emails.split(',').map(s => s.trim()).filter(Boolean) : [],
          picNames:  t.pic_names  ? t.pic_names.split(',').map(s => s.trim()).filter(Boolean) : [],
        })),

      tasks: tasksRaw
        .filter(t => t.project_id === pid)
        .map(t => ({
          id:             t.task_id,
          projectId:      t.project_id,
          title:          t.title,
          type:           t.type || 'general',
          assignedTo:     t.assigned_to || '',
          deadline:       t.deadline || '',
          detail:         t.detail || '',
          status:         t.status || 'open',
          createdAt:      t.created_at || '',
          createdBy:      t.created_by || '',
          createdByEmail: t.created_by_email || '',
          createdByRole:  t.created_by_role || '',
          updatedAt:      t.updated_at || '',
          completedAt:    t.completed_at || '',
        })),

      messages: messagesRaw
        .filter(m => m.project_id === pid)
        .map(m => ({
          id:         m.message_id,
          projectId:  m.project_id,
          subject:    m.subject,
          body:       m.body,
          fromName:   m.from_name,
          fromEmail:  m.from_email,
          createdAt:  m.created_at,
        })),

      notifications: notifsRaw
        .filter(n => n.project_id === pid)
        .map(n => ({
          id:            n.notif_id,
          projectId:     n.project_id,
          title:         n.title,
          message:       n.message,
          audience:      n.audience,
          type:          n.type || 'general',
          createdAt:     n.created_at,
          createdBy:     n.created_by || '',
          read:          String(n.read).toUpperCase() === 'TRUE',
          relatedTaskId: n.related_task_id || '',
          actionPage:    n.action_page || '',
        })),

      bookingRequests: bookingRequests.filter(r => r.project === pid),
      availability:    {},
      currentPartner:  '',
    };
  });

  return {
    superAdmin,
    projects,
    clients,
    admins,
    bookingRequests,
    meetings,
    availability,
    orgInfo,
    hubData,      // ← this is cesgs_hub_data (per-project workspace data)
    activityLog:  [],
  };
}

// ═══════════════════════════════════════════════════════════════════
//  SHEET HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Read a sheet and return array of {header: value} objects */
function readSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
    return obj;
  }).filter(obj => Object.values(obj).some(v => v !== ''));
}

/** Get a sheet by name, throw if not found */
function getSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  return sheet;
}

/** Get headers (row 1) of a sheet as array */
function getHeaders(sheet) {
  const vals = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return vals.map(h => String(h).trim());
}

/**
 * Upsert a row: if a row with idColumn === idValue exists, update it.
 * Otherwise append a new row. rowData is an object {header: value}.
 */
function upsertRow(sheetName, idColumn, idValue, rowData) {
  const sheet   = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const idColIdx = headers.indexOf(idColumn);
  const dataRange = sheet.getDataRange();
  const rows = dataRange.getValues();

  // Search for existing row (skip header row at index 0)
  let foundRow = -1;
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][idColIdx]).trim() === String(idValue).trim()) {
      foundRow = r + 1; // 1-indexed sheet row
      break;
    }
  }

  const newRow = headers.map(h => rowData.hasOwnProperty(h) ? rowData[h] : '');

  if (foundRow > 0) {
    // Update existing row
    sheet.getRange(foundRow, 1, 1, newRow.length).setValues([newRow]);
  } else {
    // Append new row
    sheet.appendRow(newRow);
  }
}

/**
 * Append or update a row by composite key (array of column names).
 */
function appendOrUpdateByComposite(sheetName, keyColumns, rowData) {
  const sheet   = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const rows    = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let r = 1; r < rows.length; r++) {
    const match = keyColumns.every(col => {
      const idx = headers.indexOf(col);
      return idx >= 0 && String(rows[r][idx]).trim() === String(rowData[col] || '').trim();
    });
    if (match) { foundRow = r + 1; break; }
  }

  const newRow = headers.map(h => rowData.hasOwnProperty(h) ? rowData[h] : '');

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, newRow.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }
}

/**
 * Delete a row by a column value.
 */
function deleteRowById(sheetName, idColumn, idValue) {
  const sheet   = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const idColIdx = headers.indexOf(idColumn);
  const rows = sheet.getDataRange().getValues();

  for (let r = rows.length - 1; r >= 1; r--) {
    if (String(rows[r][idColIdx]).trim() === String(idValue).trim()) {
      sheet.deleteRow(r + 1);
      break;
    }
  }
}

// ─── UTILS ──────────────────────────────────────────────────────────
function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Build a preferences array from a BookingRequest row */
function buildPreferences(row) {
  const prefs = [];
  if (row.pref_date_1) prefs.push({ date: row.pref_date_1, time: row.pref_time_1 || '' });
  if (row.pref_date_2) prefs.push({ date: row.pref_date_2, time: row.pref_time_2 || '' });
  if (row.pref_date_3) prefs.push({ date: row.pref_date_3, time: row.pref_time_3 || '' });
  return prefs;
}
