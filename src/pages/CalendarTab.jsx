import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import ConfirmModal from "../components/ConfirmModal";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import { motion, AnimatePresence } from "framer-motion";

const ACTIVITY_TYPES = [
  { key: "survey", label: "Site Survey" },
  { key: "site_visit", label: "Site Visit" },
  { key: "installation", label: "Installation" },
  { key: "delivery", label: "Delivery" },
  { key: "maintenance", label: "Maintenance" },
  { key: "follow_up", label: "Follow-up" },
  { key: "inspection", label: "Inspection" },
  { key: "other", label: "Other" }
];

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" }
];

const SCHEDULE_PRESETS = {
  all_day: { label: "All Day", allDay: true, startTime: "00:00", endTime: "" },
  am: { label: "AM Visit", allDay: false, startTime: "08:00", endTime: "12:00" },
  pm: { label: "PM Visit", allDay: false, startTime: "13:00", endTime: "17:00" },
  custom: { label: "Custom Time", allDay: false, startTime: "08:00", endTime: "" }
};

const SCHEDULE_OPTIONS = Object.entries(SCHEDULE_PRESETS).map(([key, value]) => ({
  key,
  label: value.label
}));

function normalizeText(value) {
  return String(value || "").trim();
}

function isAdmin(user) {
  return String(user?.role || "").toLowerCase() === "admin";
}

function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(value) {
  const date = parseLocalDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputValue(value) {
  return toDateKey(value);
}

function toTimeInputValue(value) {
  const date = parseLocalDate(value);
  if (!date) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toApiDateTime(dateValue, timeValue = "00:00") {
  const date = normalizeText(dateValue);
  if (!date) return "";
  const time = normalizeText(timeValue) || "00:00";
  return `${date} ${time}:00`;
}

function formatLongDate(value) {
  const date = parseLocalDate(value);
  if (!date) return "-";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  if (!date) return "-";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatDateTime(value, allDay = false) {
  const date = parseLocalDate(value);
  if (!date) return "-";
  if (allDay) return formatLongDate(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTimeRange(startValue, endValue, allDay) {
  if (allDay) return "All day";
  const start = parseLocalDate(startValue);
  if (!start) return "-";
  const startText = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });

  const end = parseLocalDate(endValue);
  if (!end) return startText;
  const endText = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
  return `${startText} - ${endText}`;
}

function detectScheduleMode({ startDateTime, endDateTime, allDay, startTime, endTime }) {
  if (allDay) return "all_day";

  const start = normalizeText(startTime || toTimeInputValue(startDateTime));
  const end = normalizeText(endTime || toTimeInputValue(endDateTime));

  if (start === SCHEDULE_PRESETS.am.startTime && end === SCHEDULE_PRESETS.am.endTime) return "am";
  if (start === SCHEDULE_PRESETS.pm.startTime && end === SCHEDULE_PRESETS.pm.endTime) return "pm";
  return "custom";
}

function applyScheduleMode(form, scheduleMode) {
  const preset = SCHEDULE_PRESETS[scheduleMode] || SCHEDULE_PRESETS.custom;
  const next = {
    ...form,
    scheduleMode,
    allDay: preset.allDay
  };

  if (scheduleMode === "custom") {
    next.startTime = normalizeText(form.startTime) || preset.startTime;
    next.endTime = normalizeText(form.endTime);
    return next;
  }

  next.startTime = preset.startTime;
  next.endTime = preset.endTime;
  return next;
}

function formatScheduleSummary(startValue, endValue, allDay) {
  const mode = detectScheduleMode({ startDateTime: startValue, endDateTime: endValue, allDay });
  if (mode === "all_day") return "All day";
  if (mode === "am") return `AM Visit - ${formatTimeRange(startValue, endValue, allDay)}`;
  if (mode === "pm") return `PM Visit - ${formatTimeRange(startValue, endValue, allDay)}`;
  return formatTimeRange(startValue, endValue, allDay);
}

function getEventCompletionPhotos(event) {
  if (Array.isArray(event?.completionPhotos) && event.completionPhotos.length) {
    return event.completionPhotos;
  }

  if (event?.completionPhotoUrl) {
    return [
      {
        id: `${event.id || "event"}-legacy-photo`,
        path: event.completionPhotoPath || "",
        name: event.completionPhotoName || event.title || "Work proof photo",
        url: event.completionPhotoUrl
      }
    ];
  }

  return [];
}

function formatPhotoSelectionLabel(files) {
  if (!Array.isArray(files) || files.length === 0) return "No photos selected";
  if (files.length === 1) return files[0]?.name || "1 photo selected";
  return `${files.length} photos selected`;
}

function activityTypeLabel(typeKey) {
  return ACTIVITY_TYPES.find((item) => item.key === typeKey)?.label || "Other";
}

function statusLabel(statusKey) {
  return STATUS_OPTIONS.find((item) => item.key === statusKey)?.label || "Planned";
}

function sortEventsByStart(a, b) {
  const first = parseLocalDate(a.startDateTime)?.getTime() || 0;
  const second = parseLocalDate(b.startDateTime)?.getTime() || 0;
  return first - second;
}

function buildEditorForm({
  event = null,
  dateKey = toDateKey(new Date()),
  currentUser,
  assignableUsers,
  canAssignAll
}) {
  if (event) {
    const scheduleMode = detectScheduleMode({
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      allDay: Boolean(event.allDay)
    });

    return {
      title: event.title || "",
      activityType: event.activityType || "site_visit",
      customerName: event.customerName || "",
      location: event.location || "",
      date: toDateInputValue(event.startDateTime) || dateKey,
      scheduleMode,
      allDay: Boolean(event.allDay),
      startTime: toTimeInputValue(event.startDateTime) || "08:00",
      endTime: toTimeInputValue(event.endDateTime),
      assigneeUserId: String(event.assigneeUserId || currentUser?.id || ""),
      status: event.status || "planned",
      notes: event.notes || ""
    };
  }

  const defaultAssignee = canAssignAll
    ? String(assignableUsers[0]?.id || currentUser?.id || "")
    : String(currentUser?.id || "");

  return {
    title: "",
    activityType: "site_visit",
    customerName: "",
    location: "",
    date: dateKey,
    scheduleMode: "am",
    allDay: false,
    startTime: SCHEDULE_PRESETS.am.startTime,
    endTime: SCHEDULE_PRESETS.am.endTime,
    assigneeUserId: defaultAssignee,
    status: "planned",
    notes: ""
  };
}

export default function CalendarTab({ currentUser, onActivityChange }) {
  const [events, setEvents] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [editorForm, setEditorForm] = useState(() =>
    buildEditorForm({ currentUser, assignableUsers: [], canAssignAll: false })
  );
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportForm, setReportForm] = useState({
    status: "completed",
    completionNotes: "",
    photos: []
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mobileView, setMobileView] = useState("calendar");

  useBodyScrollLock(showEditor || showReportModal);

  const canAssignAll = isAdmin(currentUser);

  const loadMeta = async () => {
    try {
      const res = await api.get("/events/meta");
      setAssignableUsers(Array.isArray(res.data?.assignableUsers) ? res.data.assignableUsers : []);
    } catch {
      if (currentUser?.id) {
        setAssignableUsers([
          {
            id: Number(currentUser.id),
            name: currentUser.name || "Current User",
            username: currentUser.username || "",
            role: currentUser.role || "field_work",
            roleLabel: currentUser.roleLabel || "Field Work"
          }
        ]);
      } else {
        setAssignableUsers([]);
      }
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/events");
      const rows = Array.isArray(res.data) ? res.data : [];
      setEvents(rows.sort(sortEventsByStart));
    } catch (err) {
      setEvents([]);
      setError(err?.response?.data?.message || "Failed to load calendar activities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const visibleEvents = useMemo(() => {
    const source = [...events].sort(sortEventsByStart);
    if (statusFilter === "all") return source;
    return source.filter((event) => event.status === statusFilter);
  }, [events, statusFilter]);

  const selectedDateEvents = useMemo(() => {
    return visibleEvents.filter((event) => toDateKey(event.startDateTime) === selectedDate);
  }, [selectedDate, visibleEvents]);

  const selectedEvent = useMemo(
    () => events.find((event) => Number(event.id) === Number(selectedEventId || 0)) || null,
    [events, selectedEventId]
  );

  const upcomingEvents = useMemo(() => {
    const today = toDateKey(new Date());
    return events
      .filter((event) => event.status !== "completed" && event.status !== "cancelled")
      .filter((event) => toDateKey(event.startDateTime) >= today)
      .sort(sortEventsByStart)
      .slice(0, 5);
  }, [events]);

  const stats = useMemo(() => {
    const today = toDateKey(new Date());
    const planned = events.filter((event) => event.status === "planned").length;
    const todayCount = events.filter((event) => toDateKey(event.startDateTime) === today).length;
    const inProgress = events.filter((event) => event.status === "in_progress").length;
    const completed = events.filter((event) => event.status === "completed").length;
    return [
      { label: "Planned Activities", value: planned, accent: "blue", icon: "calendar" },
      { label: "Due Today", value: todayCount, accent: "amber", icon: "clock" },
      { label: "In Progress", value: inProgress, accent: "orange", icon: "zap" },
      { label: "Completed", value: completed, accent: "green", icon: "check" }
    ];
  }, [events]);

  useEffect(() => {
    if (!selectedDateEvents.length) {
      if (!visibleEvents.length) {
        setSelectedEventId(null);
        return;
      }

      const nextVisible = visibleEvents.find((event) => Number(event.id) === Number(selectedEventId || 0));
      if (!nextVisible) {
        setSelectedEventId(Number(visibleEvents[0].id));
        setSelectedDate(toDateKey(visibleEvents[0].startDateTime));
      }
      return;
    }

    const selectedStillVisible = selectedDateEvents.some(
      (event) => Number(event.id) === Number(selectedEventId || 0)
    );
    if (!selectedStillVisible) {
      setSelectedEventId(Number(selectedDateEvents[0].id));
    }
  }, [selectedDateEvents, visibleEvents, selectedEventId]);

  const calendarEvents = useMemo(() => {
    return visibleEvents.map((event) => ({
      id: String(event.id),
      title: event.title,
      start: event.startDateTime,
      end: event.endDateTime || undefined,
      allDay: event.allDay,
      classNames: [`calendar-event-${event.status}`],
      extendedProps: {
        status: event.status,
        activityType: event.activityType,
        customerName: event.customerName,
        location: event.location
      }
    }));
  }, [visibleEvents]);

  const canEditSelected = Boolean(
    selectedEvent &&
      (canAssignAll ||
        (Number(selectedEvent.assigneeUserId) === Number(currentUser?.id || 0) &&
          Number(selectedEvent.createdByUserId) === Number(currentUser?.id || 0)))
  );
  const canReportSelected = Boolean(
    selectedEvent &&
      (canAssignAll || Number(selectedEvent.assigneeUserId) === Number(currentUser?.id || 0))
  );
  const selectedEventPhotos = getEventCompletionPhotos(selectedEvent);

  const openCreateModal = (dateKey = selectedDate) => {
    setEditingEventId(null);
    setEditorError("");
    setEditorForm(
      buildEditorForm({
        dateKey,
        currentUser,
        assignableUsers,
        canAssignAll
      })
    );
    setShowEditor(true);
  };

  const openEditModal = (event) => {
    if (!event) return;
    setEditingEventId(Number(event.id));
    setEditorError("");
    setEditorForm(
      buildEditorForm({
        event,
        dateKey: toDateKey(event.startDateTime),
        currentUser,
        assignableUsers,
        canAssignAll
      })
    );
    setShowEditor(true);
  };

  const openReportModal = (event) => {
    if (!event) return;
    setReportError("");
    setReportForm({
      status:
        event.status === "cancelled"
          ? "cancelled"
          : event.status === "completed"
            ? "completed"
            : "completed",
      completionNotes: event.completionNotes || "",
      photos: []
    });
    setShowReportModal(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setShowEditor(false);
    setEditingEventId(null);
    setEditorError("");
  };

  const closeReportModal = () => {
    if (reportBusy) return;
    setShowReportModal(false);
    setReportError("");
    setReportForm({ status: "completed", completionNotes: "", photos: [] });
  };

  const saveActivity = async (e) => {
    e.preventDefault();
    const title = normalizeText(editorForm.title);
    const date = normalizeText(editorForm.date);

    if (!title || !date) {
      setEditorError("Title and date are required.");
      return;
    }

    const scheduledAllDay = editorForm.scheduleMode === "all_day";
    const startTime = scheduledAllDay ? "00:00" : normalizeText(editorForm.startTime);
    const endTime = scheduledAllDay ? "" : normalizeText(editorForm.endTime);

    if (!scheduledAllDay && !startTime) {
      setEditorError("Start time is required for timed activities.");
      return;
    }

    if (
      !scheduledAllDay &&
      endTime &&
      endTime <= startTime
    ) {
      setEditorError("End time must be later than start time.");
      return;
    }

    const payload = {
      title,
      activityType: editorForm.activityType,
      customerName: editorForm.customerName,
      location: editorForm.location,
      startDateTime: toApiDateTime(date, startTime || "00:00"),
      endDateTime:
        scheduledAllDay || !endTime
          ? null
          : toApiDateTime(date, endTime),
      allDay: scheduledAllDay,
      assigneeUserId: canAssignAll
        ? Number(editorForm.assigneeUserId || 0) || Number(currentUser?.id || 0)
        : Number(currentUser?.id || 0),
      status: editorForm.status,
      notes: editorForm.notes
    };

    setSaving(true);
    setEditorError("");
    try {
      const res = editingEventId
        ? await api.put(`/events/${editingEventId}`, payload)
        : await api.post("/events", payload);

      setShowEditor(false);
      setEditingEventId(null);
      await loadEvents();
      setSelectedDate(date);
      setSelectedEventId(Number(res.data?.id || editingEventId || 0) || null);
      await onActivityChange?.();
    } catch (err) {
      setEditorError(err?.response?.data?.message || "Failed to save activity");
    } finally {
      setSaving(false);
    }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    if (!selectedEvent) return;

    if (
      !normalizeText(reportForm.completionNotes) &&
      reportForm.photos.length === 0 &&
      selectedEventPhotos.length === 0
    ) {
      setReportError("Add notes or upload at least one picture before submitting the field report.");
      return;
    }

    const formData = new FormData();
    formData.append("status", reportForm.status);
    formData.append("completionNotes", reportForm.completionNotes);
    reportForm.photos.forEach((photo) => formData.append("photos", photo));

    setReportBusy(true);
    setReportError("");
    try {
      const res = await api.post(`/events/${selectedEvent.id}/report`, formData);
      setShowReportModal(false);
      setReportForm({ status: "completed", completionNotes: "", photos: [] });
      await loadEvents();
      setSelectedEventId(Number(res.data?.id || selectedEvent.id));
      await onActivityChange?.();
    } catch (err) {
      setReportError(err?.response?.data?.message || "Failed to submit field report");
    } finally {
      setReportBusy(false);
    }
  };

  const deleteSelectedEvent = async () => {
    if (!selectedEvent) return;
    setDeleteBusy(true);
    setError("");
    try {
      await api.delete(`/events/${selectedEvent.id}`);
      setShowDeleteModal(false);
      setSelectedEventId(null);
      await loadEvents();
      await onActivityChange?.();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete activity");
    } finally {
      setDeleteBusy(false);
    }
  };

  const renderCalendarEvent = (arg) => {
    const status = arg.event.extendedProps.status;
    return (
      <div className={`calendar-event-chip calendar-event-chip-${status}`}>
        <span className="calendar-event-chip-type">
          {activityTypeLabel(arg.event.extendedProps.activityType)}
        </span>
        <span className="calendar-event-chip-schedule">
          {formatScheduleSummary(arg.event.start, arg.event.end, arg.event.allDay)}
        </span>
        <strong>{arg.event.title}</strong>
      </div>
    );
  };

  return (
    <div>
      <div className="calendar-hero-head">
        <div className="calendar-hero-left">
          <div className="calendar-hero-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <h3>Operations Calendar</h3>
            <p className="section-note">
              Plan future activities, track field work, and capture completion notes with proof photos.
            </p>
          </div>
        </div>
        <div className="calendar-head-actions">
          <button className="btn btn-primary" type="button" onClick={() => openCreateModal(selectedDate)}>
            Schedule Activity
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              const todayKey = toDateKey(new Date());
              setSelectedDate(todayKey);
            }}
          >
            Focus Today
          </button>
        </div>
      </div>

      <div className="calendar-ops-summary">
        {stats.map((stat, index) => (
          <motion.article
            className={`calendar-ops-stat calendar-ops-stat-${stat.accent}`}
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.07, ease: "easeOut" }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="calendar-stat-icon-wrap" aria-hidden="true">
              {stat.icon === "calendar" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              )}
              {stat.icon === "clock" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              )}
              {stat.icon === "zap" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              )}
              {stat.icon === "check" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              )}
            </div>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </motion.article>
        ))}
      </div>

      <div className="calendar-ops-layout">
        <div className="cal-view-toggle">
          <button
            type="button"
            className={`cal-toggle-btn${mobileView === "calendar" ? " active" : ""}`}
            onClick={() => setMobileView("calendar")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Calendar
          </button>
          <button
            type="button"
            className={`cal-toggle-btn${mobileView === "list" ? " active" : ""}`}
            onClick={() => setMobileView("list")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Activities
          </button>
        </div>

        <section className={`calendar-board-card${mobileView === "list" ? " cal-mobile-hide" : ""}`}>
          <div className="calendar-board-head">
            <div>
              <h4>Activity Planner</h4>
              <p className="section-note">
                {canAssignAll
                  ? "Assign work to field staff, log survey notes, and manage operational follow-ups."
                  : "Track your assigned field work, add future notes, and submit completion reports."}
              </p>
            </div>
            <div className="calendar-filter-pills">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`step-pill ${statusFilter === option.key ? "active" : ""}`}
                  onClick={() => setStatusFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="error-text">{error}</div>}

          <div className="calendar-wrap calendar-ops-wrap">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: ""
              }}
              events={calendarEvents}
              height="auto"
              fixedWeekCount={false}
              dayMaxEventRows={3}
              eventContent={renderCalendarEvent}
              dateClick={(info) => {
                const dateKey = info.dateStr;
                setSelectedDate(dateKey);
                openCreateModal(dateKey);
              }}
              eventClick={(info) => {
                setSelectedEventId(Number(info.event.id));
                setSelectedDate(toDateKey(info.event.start));
              }}
              dayCellClassNames={(arg) =>
                toDateKey(arg.date) === selectedDate ? ["calendar-day-selected"] : []
              }
            />
          </div>
        </section>

        <aside className={`calendar-sidebar-card${mobileView === "calendar" ? " cal-mobile-hide" : ""}`}>
          <div className="calendar-sidebar-top">
            <div>
              <span className="calendar-selected-label">Selected Day</span>
              <h4>{formatLongDate(selectedDate)}</h4>
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => openCreateModal(selectedDate)}>
              Add for Day
            </button>
          </div>

          <div className="calendar-day-activity-list">
            <div className="calendar-sidebar-section-head">
              <strong>Activities ({selectedDateEvents.length})</strong>
              {loading && <span>Loading...</span>}
            </div>

            {!selectedDateEvents.length && !loading && (
              <div className="calendar-empty-card">
                <strong>No scheduled activity</strong>
                <span>Add a survey, installation, delivery, or follow-up for this date.</span>
              </div>
            )}

            {selectedDateEvents.map((event, index) => (
              <motion.button
                key={event.id}
                type="button"
                className={`calendar-activity-card calendar-status-${event.status} ${
                  Number(selectedEventId || 0) === Number(event.id) ? "active" : ""
                }`}
                onClick={() => setSelectedEventId(Number(event.id))}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: index * 0.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="calendar-activity-card-top">
                  <span className={`status-pill status-pill-${event.status}`}>{statusLabel(event.status)}</span>
                  <span className="calendar-activity-type">{activityTypeLabel(event.activityType)}</span>
                </div>
                <strong>{event.title}</strong>
                <div className="calendar-activity-meta">
                  <span>{formatScheduleSummary(event.startDateTime, event.endDateTime, event.allDay)}</span>
                  <span>{event.customerName || "General activity"}</span>
                  <span>{event.assigneeName || event.assigneeUsername || "Unassigned"}</span>
                </div>
              </motion.button>
            ))}
          </div>

          <div className="calendar-focus-card">
            <div className="calendar-sidebar-section-head">
              <strong>Activity Detail</strong>
              {selectedEvent && (
                <span className={`status-pill status-pill-${selectedEvent.status}`}>
                  {statusLabel(selectedEvent.status)}
                </span>
              )}
            </div>

            {!selectedEvent && (
              <div className="calendar-empty-card">
                <strong>No activity selected</strong>
                <span>Pick a day with work or schedule a new future activity.</span>
              </div>
            )}

            <AnimatePresence mode="wait">
            {selectedEvent && (
              <motion.div
                key={selectedEvent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="calendar-focus-title-row">
                  <div>
                    <h4>{selectedEvent.title}</h4>
                    <p>{activityTypeLabel(selectedEvent.activityType)}</p>
                  </div>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => openEditModal(selectedEvent)}
                    disabled={!canEditSelected}
                  >
                    Edit
                  </button>
                </div>

                <div className="calendar-detail-grid">
                  <div className="calendar-detail-item">
                    <span>Customer</span>
                    <strong>{selectedEvent.customerName || "N/A"}</strong>
                  </div>
                  <div className="calendar-detail-item">
                    <span>Location</span>
                    <strong>{selectedEvent.location || "N/A"}</strong>
                  </div>
                  <div className="calendar-detail-item">
                    <span>When</span>
                    <strong>{formatDateTime(selectedEvent.startDateTime, selectedEvent.allDay)}</strong>
                  </div>
                  <div className="calendar-detail-item">
                    <span>Time</span>
                    <strong>
                      {formatScheduleSummary(
                        selectedEvent.startDateTime,
                        selectedEvent.endDateTime,
                        selectedEvent.allDay
                      )}
                    </strong>
                  </div>
                  <div className="calendar-detail-item">
                    <span>Assigned To</span>
                    <strong>{selectedEvent.assigneeName || selectedEvent.assigneeUsername || "N/A"}</strong>
                  </div>
                  <div className="calendar-detail-item">
                    <span>Created By</span>
                    <strong>{selectedEvent.createdByName || selectedEvent.createdByUsername || "N/A"}</strong>
                  </div>
                </div>

                <div className="calendar-note-card">
                  <span>Planning Notes</span>
                  <p>{selectedEvent.notes || "No planning note added yet."}</p>
                </div>

                <div className="calendar-note-card calendar-note-card-completion">
                  <span>Field Report</span>
                  <p>{selectedEvent.completionNotes || "No field report submitted yet."}</p>
                  {selectedEvent.completedAt && (
                    <strong>Submitted: {formatShortDate(selectedEvent.completedAt)}</strong>
                  )}
                </div>

                {selectedEventPhotos.length > 0 && (
                  <div className="calendar-proof-card">
                    <div className="calendar-sidebar-section-head">
                      <strong>Work Proof Photos</strong>
                      <span>{selectedEventPhotos.length} file{selectedEventPhotos.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="calendar-proof-grid">
                      {selectedEventPhotos.map((photo) => (
                        <a
                          key={photo.id || photo.url}
                          href={photo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="calendar-proof-thumb"
                        >
                          <img src={photo.url} alt={photo.name || selectedEvent.title} />
                          <span>{photo.name || "Open photo"}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="calendar-action-stack">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => openReportModal(selectedEvent)}
                    disabled={!canReportSelected || selectedEvent.status === "cancelled"}
                  >
                    {selectedEvent.status === "completed" ? "Update Field Report" : "Submit Field Report"}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    disabled={!canEditSelected}
                  >
                    Delete Activity
                  </button>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          <div className="calendar-upcoming-card">
            <div className="calendar-sidebar-section-head">
              <strong>Upcoming Queue</strong>
              <span>{upcomingEvents.length} items</span>
            </div>
            <div className="calendar-upcoming-list">
              {!upcomingEvents.length && (
                <div className="calendar-empty-card">
                  <strong>No upcoming work</strong>
                  <span>Future activities will appear here once they are scheduled.</span>
                </div>
              )}

              {upcomingEvents.map((event, index) => (
                <motion.button
                  key={`upcoming-${event.id}`}
                  type="button"
                  className={`calendar-upcoming-item calendar-status-${event.status}`}
                  onClick={() => {
                    setSelectedDate(toDateKey(event.startDateTime));
                    setSelectedEventId(Number(event.id));
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22, delay: index * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="calendar-upcoming-item-top">
                    <span className="calendar-upcoming-type">{activityTypeLabel(event.activityType)}</span>
                    <span className={`status-pill status-pill-${event.status}`}>{statusLabel(event.status)}</span>
                  </div>
                  <strong>{event.title}</strong>
                  <span>
                    {event.customerName ? `${event.customerName} - ` : ""}
                    {formatShortDate(event.startDateTime)} - {formatScheduleSummary(event.startDateTime, event.endDateTime, event.allDay)}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
      {showEditor && (
        <motion.div
          className="modal-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="modal-card calendar-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-editor-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 32 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 32 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            <div className="modal-copy">
              <h4 id="calendar-editor-title">{editingEventId ? "Edit Activity" : "Schedule Activity"}</h4>
              <p>
                Capture the work plan, customer details, and assignment so the field team can act on it later.
              </p>
            </div>

            <form className="calendar-form" onSubmit={saveActivity}>
              <div className="calendar-form-grid">
                <label className="field calendar-field-span-2">
                  <span>Activity Title</span>
                  <input
                    className="input"
                    value={editorForm.title}
                    onChange={(e) => setEditorForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Roof survey, installation visit, delivery, follow-up..."
                  />
                </label>

                <label className="field">
                  <span>Activity Type</span>
                  <select
                    className="select"
                    value={editorForm.activityType}
                    onChange={(e) => setEditorForm((prev) => ({ ...prev, activityType: e.target.value }))}
                  >
                    {ACTIVITY_TYPES.map((type) => (
                      <option value={type.key} key={type.key}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Status</span>
                  <select
                    className="select"
                    value={editorForm.status}
                    onChange={(e) => setEditorForm((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.filter((option) => option.key !== "all").map((status) => (
                      <option value={status.key} key={status.key}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Customer</span>
                  <input
                    className="input"
                    value={editorForm.customerName}
                    onChange={(e) => setEditorForm((prev) => ({ ...prev, customerName: e.target.value }))}
                    placeholder="Customer name"
                  />
                </label>

                <label className="field">
                  <span>Location</span>
                  <input
                    className="input"
                    value={editorForm.location}
                    onChange={(e) => setEditorForm((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="Site location / address"
                  />
                </label>

                <label className="field">
                  <span>Date</span>
                  <input
                    className="input"
                    type="date"
                    value={editorForm.date}
                    onChange={(e) => setEditorForm((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Schedule</span>
                  <select
                    className="select"
                    value={editorForm.scheduleMode}
                    onChange={(e) => setEditorForm((prev) => applyScheduleMode(prev, e.target.value))}
                  >
                    {SCHEDULE_OPTIONS.map((option) => (
                      <option value={option.key} key={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {editorForm.scheduleMode !== "all_day" && (
                  <>
                    <label className="field">
                      <span>Start Time</span>
                      <input
                        className="input"
                        type="time"
                        value={editorForm.startTime}
                        onChange={(e) =>
                          setEditorForm((prev) => ({ ...prev, startTime: e.target.value }))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>End Time</span>
                      <input
                        className="input"
                        type="time"
                        value={editorForm.endTime}
                        onChange={(e) =>
                          setEditorForm((prev) => ({ ...prev, endTime: e.target.value }))
                        }
                      />
                    </label>
                  </>
                )}

                <label className="field">
                  <span>Assigned To</span>
                  <select
                    className="select"
                    value={editorForm.assigneeUserId}
                    onChange={(e) =>
                      setEditorForm((prev) => ({ ...prev, assigneeUserId: e.target.value }))
                    }
                    disabled={!canAssignAll}
                  >
                    {assignableUsers.map((user) => (
                      <option value={user.id} key={user.id}>
                        {`${user.name} (${user.roleLabel})`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field calendar-field-span-2">
                  <span>Planning Notes</span>
                  <textarea
                    className="input calendar-textarea"
                    value={editorForm.notes}
                    onChange={(e) => setEditorForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Work scope, reminders, site concerns, or materials to prepare."
                  />
                </label>
              </div>

              {editorError && <div className="error-text">{editorError}</div>}

              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={closeEditor} disabled={saving}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingEventId ? "Save Changes" : "Create Activity"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {showReportModal && selectedEvent && (
        <motion.div
          className="modal-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="modal-card calendar-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-report-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 32 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 32 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            <div className="modal-copy">
              <h4 id="calendar-report-title">Field Report</h4>
              <p>
                Add completion notes and optional proof photos for <strong>{selectedEvent.title}</strong>.
              </p>
            </div>

            <form className="calendar-form" onSubmit={submitReport}>
              <div className="calendar-form-grid">
                <label className="field">
                  <span>Report Status</span>
                  <select
                    className="select"
                    value={reportForm.status}
                    onChange={(e) => setReportForm((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.filter((option) => ["in_progress", "completed", "cancelled"].includes(option.key)).map(
                      (status) => (
                        <option value={status.key} key={status.key}>
                          {status.label}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <div className="field calendar-field-span-2">
                  <span>Work Proof Photos</span>
                  <label className="calendar-upload-shell">
                    <input
                      className="calendar-upload-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) =>
                        setReportForm((prev) => ({
                          ...prev,
                          photos: Array.from(e.target.files || [])
                        }))
                      }
                    />
                    <span className="calendar-upload-button">
                      {reportForm.photos.length > 0
                        ? "Change Photos"
                        : selectedEventPhotos.length > 0
                          ? "Add More Photos"
                          : "Choose Photos"}
                    </span>
                    <span className={`calendar-upload-name ${reportForm.photos.length > 0 ? "is-selected" : ""}`}>
                      {reportForm.photos.length > 0
                        ? formatPhotoSelectionLabel(reportForm.photos)
                        : selectedEventPhotos.length > 0
                          ? `${selectedEventPhotos.length} current photo${selectedEventPhotos.length === 1 ? "" : "s"}`
                          : "No photos selected"}
                    </span>
                  </label>
                  {reportForm.photos.length > 0 && (
                    <div className="calendar-upload-list">
                      {reportForm.photos.map((photo) => (
                        <span className="calendar-upload-pill" key={`${photo.name}-${photo.lastModified}`}>
                          {photo.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedEventPhotos.length > 0 && (
                    <div className="calendar-proof-card calendar-proof-card-inline">
                      <div className="calendar-sidebar-section-head">
                        <strong>Current Photos</strong>
                        <span>{selectedEventPhotos.length} file{selectedEventPhotos.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="calendar-proof-grid">
                        {selectedEventPhotos.map((photo) => (
                          <a
                            key={photo.id || photo.url}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="calendar-proof-thumb"
                          >
                            <img src={photo.url} alt={photo.name || selectedEvent.title} />
                            <span>{photo.name || "Open photo"}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <label className="field calendar-field-span-2">
                  <span>Done Work Notes</span>
                  <textarea
                    className="input calendar-textarea"
                    value={reportForm.completionNotes}
                    onChange={(e) =>
                      setReportForm((prev) => ({ ...prev, completionNotes: e.target.value }))
                    }
                    placeholder="What was done, findings on site, next action needed, customer feedback, or materials used."
                  />
                </label>
              </div>

              {reportError && <div className="error-text">{reportError}</div>}

              <div className="modal-actions">
                <button className="btn btn-ghost" type="button" onClick={closeReportModal} disabled={reportBusy}>
                  Cancel
                </button>
                <button className="btn btn-secondary" type="submit" disabled={reportBusy}>
                  {reportBusy ? "Submitting..." : "Save Field Report"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <ConfirmModal
        open={showDeleteModal && Boolean(selectedEvent)}
        title="Delete Activity"
        message={
          selectedEvent
            ? `Delete ${selectedEvent.title}? This removes the activity schedule and any submitted report photos.`
            : ""
        }
        confirmLabel="Delete Activity"
        tone="danger"
        busy={deleteBusy}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={deleteSelectedEvent}
      />
    </div>
  );
}
