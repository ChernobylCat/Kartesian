try {
  if (localStorage.getItem('theme_preference') === 'dark') {
    document.body.classList.add('dark');
  }
} catch {
  // Storage dapat diblokir oleh browser; tema terang tetap menjadi fallback aman.
}
