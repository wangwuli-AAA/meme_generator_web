document.addEventListener('DOMContentLoaded', () => {
  // Mobile sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const mobileToggle = document.getElementById('mobile-sidebar-toggle');
  const sidebarToggle = document.getElementById('sidebar-toggle');

  mobileToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  // Close sidebar when clicking a tag on mobile
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.tag-item') && window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      e.target !== mobileToggle
    ) {
      sidebar.classList.remove('open');
    }
  });

  // Initialize modules
  Form.init();
  Browser.init();
});
