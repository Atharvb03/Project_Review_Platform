export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userName');
  localStorage.removeItem('uploads');
  localStorage.removeItem('pcEmail');
  window.location.href = '/login';
}
