/* Receives Firebase Cloud Messaging pushes while the app is closed.
 * The public web config is passed in the registration URL query string (it is not a secret). */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const params = new URL(self.location.href).searchParams
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  appId: params.get('appId'),
  messagingSenderId: params.get('messagingSenderId'),
})

// Messages sent with a `notification` payload are displayed by the SDK automatically.
firebase.messaging()

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data && event.notification.data.FCM_MSG.data.incidentId)
    ? `/incidents/${event.notification.data.FCM_MSG.data.incidentId}`
    : '/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(target); return c.focus() }
      return self.clients.openWindow(target)
    }),
  )
})
