const text = "This is a [Student Portal](https://www.waldenu.edu/student-portal) test.\nStandalone: https://youtu.be/ClgP0GtP2uQ";

let html = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
    return `<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">${label} <span class="material-icons" style="font-size: 14px; color: #3b82f6; text-decoration: none;">launch</span></a>`;
});

html = html.replace(/(^|[^="'])(https?:\/\/[^\s<)]+)/g, (match, prefix, url) => {
    return `${prefix}<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">Link <span class="material-icons" style="font-size: 14px; color: #3b82f6; text-decoration: none;">launch</span></a>`;
});

console.log(html);
