// notifications.js

export function updateNotificationBadge() {
  const badge = document.getElementById("notificationStatus");
  if (!badge) return;
  badge.classList.remove(
    "badge-perm-default",
    "badge-perm-granted",
    "badge-perm-denied"
  );
  const perm =
    typeof Notification !== "undefined" ? Notification.permission : "denied";
  if (perm === "granted") {
    badge.textContent = "許可";
    badge.classList.add("badge-perm-granted");
  } else if (perm === "denied") {
    badge.textContent = "拒否";
    badge.classList.add("badge-perm-denied");
  } else {
    badge.textContent = "未判定";
    badge.classList.add("badge-perm-default");
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("このブラウザは通知に対応していません");
    return;
  }
  await Notification.requestPermission();
  updateNotificationBadge();
}

// HTML の onclick からも呼べるように
if (typeof window !== "undefined") {
  window.requestNotificationPermission = requestNotificationPermission;
}
