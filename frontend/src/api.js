import axios from "axios";

let _backendUrl = "";

export function initApi(backendUrl) {
  _backendUrl = backendUrl;
}

export async function fetchSemesters() {
  const resp = await axios.get(`${_backendUrl}/api/semesters`);
  return resp.data;
}

export async function fetchSections(courseId, termId) {
  const resp = await axios.post(`${_backendUrl}/api/sections`, { courseId, termId });
  return resp.data;
}

export async function fetchCompare(courseId, professors) {
  const resp = await axios.post(`${_backendUrl}/api/compare`, { courseId, professors });
  return resp.data;
}

export async function fetchProfessorsForCourse(courseId, termId) {
  const sectionsData = await fetchSections(courseId, termId);
  return fetchCompare(courseId, sectionsData.professors);
}

export async function fetchFeedback(courseId, professor) {
  const resp = await axios.post(`${_backendUrl}/api/feedback`, { courseId, professor });
  return resp.data;
}

export async function fetchPrograms() {
  const resp = await axios.get(`${_backendUrl}/api/programs`);
  return resp.data;
}

export async function fetchRequirements(catalogUrl, programName) {
  const resp = await axios.post(`${_backendUrl}/api/requirements`, { catalogUrl, programName });
  return resp.data;
}

export async function fetchTranscript() {
  const resp = await axios.post(`${_backendUrl}/api/transcript`);
  return resp.data;
}

export async function fetchRecommendations(payload) {
  const resp = await axios.post(`${_backendUrl}/api/recommend`, payload);
  return resp.data;
}

export async function fetchBestProfessors(courseIds, termId) {
  const resp = await axios.post(`${_backendUrl}/api/best-professors`, { courseIds, termId });
  return resp.data;
}
