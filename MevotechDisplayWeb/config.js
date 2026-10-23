/* Mevotech Display: settings you may want to change. Edit this file on GitHub, then reload the display. */
window.KIOSK_CONFIG = {
  catalogUrl: "https://www.mevotech.com/",
  youtubeChannelId: "UCFvuEzmZJXDUyuhtta7SPWQ",   // youtube.com/user/MevotechParts

  pin: "2580",                // PIN for the hidden settings (hold the logo for 3 seconds)

  idleMinutes: 3,             // untouched for this long: back to the menu (or the customer welcome)
  youtubeIdleMinutes: 15,     // longer on YouTube, since the display can't tell if a video is playing
  loopVideos: true,
  autoFullscreen: true,       // in a normal Chrome tab, go full screen on the first tap
  checkForNewFilesMinutes: 15 // how often the display looks for newly uploaded media and customers
};
