// Alfresco Zimlet for Zimbra Modern UI
// Injects an "Alfresco Zimlet" button into the email-message toolbar
// (next to Move / Spam / Delete).
//
// Note: Zimbra's SideLoader SDK runs this script inside a hidden 28x28
// sandbox iframe, so all DOM access must be against window.top.document.

console.log('[Alfresco] Loading...');

var ADDIN_BASE_URL = 'https://santosh0123456.github.io/alfresco-zimlet';
var LOGO_URL = ADDIN_BASE_URL + '/assets/alfresco-icon-32.png';

// Store pending action for reopening after login - ONE SOURCE OF TRUTH
var pendingActionAfterLogin = null;
// Flag to indicate attachment is in progress
var isAttaching = false;
// Track if right-side panel is open
var isRightSidePanelOpen = false;

// Check if we are on a compose/new email page
function isComposePage() {
  try {
    var url = topWin.location.href;
    // Check URL for compose indicators - be more specific
    if (url.includes('/compose') || url.includes('/new') || url.includes('/edit') || url.includes('/draft')) {
      console.log('[Alfresco] Compose page detected via URL');
      return true;
    }
    
    // Check for compose mode in DOM (Zimbra specific)
    // Look for compose-specific elements
    var composeElements = topDoc.querySelectorAll(
      '[data-mode="compose"], .compose-mode, .NewMessage, .compose-container, ' +
      '[aria-label*="compose" i], .compose-body, .email-compose, .msg-compose'
    );
    if (composeElements.length > 0) {
      console.log('[Alfresco] Compose mode detected via DOM');
      return true;
    }
    
    // Also check for rich text editor in compose mode
    var editorElements = topDoc.querySelectorAll('[contenteditable="true"], .compose-editor, .message-body-editor');
    if (editorElements.length > 0 && !url.includes('/message/') && !url.includes('/conversation/')) {
      console.log('[Alfresco] Compose editor detected');
      return true;
    }
    
    // If we have attachment button in toolbar, we're likely in compose mode
    var attachButton = topDoc.querySelector('button[title*="Attach"], button[aria-label*="Attach"]');
    if (attachButton && !url.includes('/message/') && !url.includes('/conversation/')) {
      console.log('[Alfresco] Attachment button detected - likely compose mode');
      return true;
    }
    
    // Check if we're in message read mode (has email content)
    var readElements = topDoc.querySelectorAll('[data-msg-id], .message-view, .email-content, .conversation-view');
    if (readElements.length > 0) {
      console.log('[Alfresco] Read mode detected');
      return false;
    }
    
    return false;
  } catch (e) {
    console.warn('[Alfresco] Error checking page type:', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Alfresco URL Management - Sync with manifest.xml
// ---------------------------------------------------------------------------

function getAlfrescoBaseUrl() {
  var storedUrl = localStorage.getItem('Alfrecobaseurl');
  if (storedUrl && storedUrl !== 'undefined' && storedUrl !== 'null' && storedUrl !== '') {
    console.log('[Alfresco] Using stored Alfresco URL from localStorage:', storedUrl);
    return storedUrl;
  }
  console.log('[Alfresco] Using manifest URL from ADDIN_BASE_URL:', ADDIN_BASE_URL);
  return ADDIN_BASE_URL;
}

function setAlfrescoBaseUrl(url) {
  if (url && url !== 'undefined' && url !== 'null' && url !== '') {
    localStorage.setItem('Alfrecobaseurl', url);
    console.log('[Alfresco] Alfresco URL updated to:', url);
    return true;
  }
  return false;
}

function clearAlfrescoBaseUrl() {
  localStorage.removeItem('Alfrecobaseurl');
  console.log('[Alfresco] Alfresco URL cleared');
}

window.AlfrescoZimletUrl = {
  getBaseUrl: getAlfrescoBaseUrl,
  setBaseUrl: setAlfrescoBaseUrl,
  clearBaseUrl: clearAlfrescoBaseUrl
};

function getTopDoc() {
  try {
    return (window.top && window.top.document) ? window.top.document : document;
  } catch (e) {
    console.warn('[Alfresco] Cannot access window.top:', e.message);
    return document;
  }
}

var topDoc = getTopDoc();
var topWin = topDoc.defaultView || window.top || window;

// ---------------------------------------------------------------------------
// Build the read mode button element (single instance, reused on every re-mount)
// ---------------------------------------------------------------------------
function buildToolbarButton() {
  var btn = topDoc.createElement('button');
  btn.id = 'alfresco-toolbar-btn';
  btn.type = 'button';
  btn.title = 'Alfresco Zimlet';
  btn.setAttribute('style',
    'display:inline-flex !important;' +
    'align-items:center !important;' +
    'gap:6px !important;' +
    'background:transparent !important;' +
    'border:none !important;' +
    'color:#1a73e8 !important;' +
    'cursor:pointer !important;' +
    'padding:6px 10px !important;' +
    'margin:0 4px !important;' +
    'font-family:inherit !important;' +
    'font-size:13px !important;' +
    'font-weight:500 !important;' +
    'border-radius:4px !important;' +
    'white-space:nowrap !important;' +
    'vertical-align:middle !important;'
  );

  var img = topDoc.createElement('img');
  img.src = LOGO_URL;
  img.alt = 'Alfresco';
  img.setAttribute('style', 'width:18px !important;height:18px !important;display:inline-block !important;');
  img.onerror = function() { img.style.display = 'none'; };

  var span = topDoc.createElement('span');
  span.textContent = 'Alfresco Zimlet';

  btn.appendChild(img);
  btn.appendChild(span);

  btn.onmouseover = function() { btn.style.background = '#e8f0fe'; };
  btn.onmouseout  = function() { btn.style.background = 'transparent'; };

  // Dropdown menu
  var menu = null;
  btn.onclick = function(e) {
    e.stopPropagation();
    if (menu) { menu.remove(); menu = null; return; }

    var rect = btn.getBoundingClientRect();
    menu = topDoc.createElement('div');
    menu.id = 'alfresco-menu';
    menu.setAttribute('style',
      'position:fixed !important;' +
      'top:' + (rect.bottom + 4) + 'px !important;' +
      'left:' + Math.max(8, rect.right - 240) + 'px !important;' +
      'background:#ffffff !important;' +
      'border:1px solid #e0e0e0 !important;' +
      'border-radius:6px !important;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.18) !important;' +
      'min-width:240px !important;' +
      'z-index:2147483647 !important;' +
      'font-family:Arial,sans-serif !important;' +
      'overflow:hidden !important;'
    );

    [
      { action: 'login',            label: 'Login to Alfresco',        icon: ADDIN_BASE_URL + '/assets/login-icon-32.png' },
      { action: 'alfrescosave',     label: 'Save to Alfresco',         icon: ADDIN_BASE_URL + '/assets/save-icon-32.png' },
      { action: 'selectattachment', label: 'Save Attachment(s) Only',  icon: ADDIN_BASE_URL + '/assets/attachment-icon-32.png' },
      { action: 'alfrescoopen',     label: 'Open from Alfresco',       icon: ADDIN_BASE_URL + '/assets/open-icon-32.png' },
      { action: 'addinversion',     label: 'Add-in Version',           icon: ADDIN_BASE_URL + '/assets/alfresco-icon-32.png' }
    ].forEach(function(item) {
      var mi = topDoc.createElement('div');
      mi.setAttribute('style',
        'display:flex !important;align-items:center !important;gap:10px !important;' +
        'padding:10px 14px;cursor:pointer;font-size:13px;color:#333;' +
        'border-bottom:1px solid #f0f0f0;background:white;white-space:nowrap;'
      );
      var iconImg = topDoc.createElement('img');
      iconImg.src = item.icon;
      iconImg.alt = '';
      iconImg.setAttribute('style', 'width:18px;height:18px;flex-shrink:0;');
      iconImg.onerror = function() { iconImg.style.display = 'none'; };
      var labelSpan = topDoc.createElement('span');
      labelSpan.textContent = item.label;
      mi.appendChild(iconImg);
      mi.appendChild(labelSpan);
      mi.onmouseover = function() { mi.style.background = '#e8f0fe'; };
      mi.onmouseout  = function() { mi.style.background = 'white'; };
      mi.onclick = function() {
        // Store the action before opening modal for potential reopening after login
        console.log('[Alfresco] Menu clicked - action:', item.action);
        pendingActionAfterLogin = item.action;
        openAlfrescoModal(item.action);
        if (menu) { menu.remove(); menu = null; }
      };
      menu.appendChild(mi);
    });

    topDoc.body.appendChild(menu);
  };

  topDoc.addEventListener('click', function(e) {
    if (menu && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.remove(); menu = null;
    }
  });

  return btn;
}

var alfrescoBtn = null;

// ---------------------------------------------------------------------------
// Build the compose mode button element (Add Attachment(s))
// ---------------------------------------------------------------------------
function buildComposeButton() {
  var btn = topDoc.createElement('button');
  btn.id = 'alfresco-compose-btn';
  btn.type = 'button';
  btn.title = 'Add Attachment(s) from Alfresco';
  btn.setAttribute('style',
    'display:inline-flex !important;' +
    'align-items:center !important;' +
    'gap:6px !important;' +
    'background:transparent !important;' +
    'border:none !important;' +
    'color:#1a73e8 !important;' +
    'cursor:pointer !important;' +
    'padding:6px 10px !important;' +
    'margin:0 4px !important;' +
    'font-family:inherit !important;' +
    'font-size:13px !important;' +
    'font-weight:500 !important;' +
    'border-radius:4px !important;' +
    'white-space:nowrap !important;' +
    'vertical-align:middle !important;'
  );

  var img = topDoc.createElement('img');
  img.src = LOGO_URL;
  img.alt = 'Alfresco';
  img.setAttribute('style', 'width:18px !important;height:18px !important;display:inline-block !important;');
  img.onerror = function() { img.style.display = 'none'; };

  var span = topDoc.createElement('span');
  span.textContent = 'Add Attachment(s)';

  btn.appendChild(img);
  btn.appendChild(span);

  btn.onmouseover = function() { btn.style.background = '#e8f0fe'; };
  btn.onmouseout = function() { btn.style.background = 'transparent'; };

  btn.onclick = function(e) {
    e.stopPropagation();
    console.log('[Alfresco] Add Attachment(s) button clicked');
    openAddAttachmentModal();
  };

  return btn;
}

var composeBtn = null;

// ---------------------------------------------------------------------------
// Open Right-Side Panel (attached to Zimbra's main window)
// ---------------------------------------------------------------------------
function openRightSidePanel() {
  console.log('[Alfresco] Opening right-side panel in main window context');

  // Remove existing side panel if any
  var existingPanel = topDoc.getElementById('alfresco-side-panel');
  if (existingPanel) {
    existingPanel.remove();
    isRightSidePanelOpen = false;
    return;
  }

  // Create panel container in the main document (top window)
  var panel = topDoc.createElement('div');
  panel.id = 'alfresco-side-panel';
  panel.setAttribute('style',
    'position:fixed !important;' +
    'top:0 !important;' +
    'right:0 !important;' +
    'width:380px !important;' +
    'height:100vh !important;' +
    'background:#ffffff !important;' +
    'border-left:1px solid #e0e0e0 !important;' +
    'z-index:2147483647 !important;' +
    'display:flex !important;' +
    'flex-direction:column !important;' +
    'box-shadow:-4px 0 20px rgba(0,0,0,0.15) !important;' +
    'animation:slideInRight 0.3s ease !important;'
  );

  // Add animation style if not exists
  if (!topDoc.querySelector('#alfresco-panel-style')) {
    var style = topDoc.createElement('style');
    style.id = 'alfresco-panel-style';
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }
      @keyframes slideOutRight {
        from { transform: translateX(0); }
        to { transform: translateX(100%); }
      }
    `;
    topDoc.head.appendChild(style);
  }

  // Panel header
  var header = topDoc.createElement('div');
  header.setAttribute('style',
    'display:flex;align-items:center;justify-content:space-between;padding:14px 18px;' +
    'background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:white;' +
    'border-bottom:1px solid rgba(255,255,255,0.2);flex-shrink:0;'
  );
  
  var title = topDoc.createElement('span');
  title.textContent = '📎 Add Attachment from Alfresco';
  title.setAttribute('style', 'font-weight:600;font-size:15px;');
  
  var closeBtn = topDoc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '\u2715';
  closeBtn.setAttribute('style',
    'background:rgba(255,255,255,0.2);border:none;font-size:16px;cursor:pointer;' +
    'padding:6px 10px;border-radius:4px;color:white;'
  );
  closeBtn.onmouseover = function() { this.style.background = 'rgba(255,255,255,0.3)'; };
  closeBtn.onmouseout = function() { this.style.background = 'rgba(255,255,255,0.2)'; };
  closeBtn.onclick = function(e) { 
    e.stopPropagation(); 
    panel.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(function() {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    }, 300);
    isRightSidePanelOpen = false;
  };
  
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Iframe content - load the addattachment page
  var iframe = topDoc.createElement('iframe');
  iframe.src = ADDIN_BASE_URL + '/addattachment.html?action=addattachment&compose=true&panel=true';
  iframe.setAttribute('style', 'flex:1 !important;width:100% !important;border:0 !important;min-height:0 !important;');
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

  panel.appendChild(header);
  panel.appendChild(iframe);

  // Add panel to the document
  topDoc.body.appendChild(panel);
  isRightSidePanelOpen = true;
  
  console.log('[Alfresco] Right-side panel opened in main window');
}

function openAddAttachmentModal() {
  console.log('[Alfresco] Opening Add Attachment dialog/panel');
  
  // If we're on a compose page, toggle the right-side panel
  if (isComposePage()) {
    // Close any existing modal overlay
    var existingOverlay = topDoc.getElementById('alfresco-addattachment-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    // Toggle panel
    var existingPanel = topDoc.getElementById('alfresco-side-panel');
    if (existingPanel) {
      // Close panel with animation
      existingPanel.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(function() {
        if (existingPanel.parentNode) existingPanel.parentNode.removeChild(existingPanel);
      }, 300);
      isRightSidePanelOpen = false;
    } else {
      openRightSidePanel();
    }
    return;
  }
  
  // For non-compose pages (read mode), use the modal dialog
  var existing = topDoc.getElementById('alfresco-addattachment-overlay');
  if (existing) existing.remove();
  
  var overlay = topDoc.createElement('div');
  overlay.id = 'alfresco-addattachment-overlay';
  overlay.setAttribute('style',
    'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;' +
    'background:rgba(0,0,0,0.5) !important;z-index:2147483646 !important;display:flex !important;' +
    'align-items:center !important;justify-content:center !important;'
  );

  var dialog = topDoc.createElement('div');
  dialog.setAttribute('style',
    'position:relative !important;width:735px !important;max-width:94vw !important;' +
    'height:520px !important;max-height:92vh !important;background:#ffffff !important;' +
    'border-radius:10px !important;box-shadow:0 20px 50px rgba(0,0,0,0.4) !important;' +
    'overflow:hidden !important;display:flex !important;flex-direction:column !important;'
  );

  var header = topDoc.createElement('div');
  header.setAttribute('style',
    'display:flex !important;align-items:center !important;justify-content:space-between !important;' +
    'padding:10px 16px !important;background:#1a73e8 !important;color:#ffffff !important;' +
    'font-size:14px !important;font-weight:600 !important;flex-shrink:0 !important;'
  );
  
  var title = topDoc.createElement('span');
  title.textContent = 'Add Attachment from Alfresco';
  
  var closeBtn = topDoc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '\u2715';
  closeBtn.setAttribute('style',
    'background:transparent !important;border:none !important;color:#ffffff !important;' +
    'font-size:18px !important;cursor:pointer !important;padding:4px 10px !important;border-radius:4px !important;'
  );
  
  var closeModal = function() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  closeBtn.onclick = function(e) { e.stopPropagation(); closeModal(); };
  header.appendChild(title);
  header.appendChild(closeBtn);

  var iframe = topDoc.createElement('iframe');
  iframe.src = ADDIN_BASE_URL + '/addattachment.html?action=addattachment&compose=true';
  iframe.setAttribute('style', 'flex:1 !important;width:100% !important;border:0 !important;');
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

  dialog.appendChild(header);
  dialog.appendChild(iframe);
  overlay.appendChild(dialog);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal();
  });

  topDoc.documentElement.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// MODIFIED: Zimbra email extraction - Parse raw email with attachments
// ---------------------------------------------------------------------------
var ZimbraMail = (function () {
  function zimbraOrigin() { return topWin.location.origin; }

  function getCurrentMessageId() {
    // Get from URL
    var m = topWin.location.pathname.match(/\/(?:message|conversation)\/(-?\d+)/);
    if (m) {
      console.log('[Alfresco] MessageId from URL:', m[1]);
      return m[1];
    }
    
    // Fallback to DOM
    var sel = topDoc.querySelector('[data-msg-id], [data-message-id], [data-id^="msg-"], [data-id^="m-"]');
    if (sel) {
      var v = sel.getAttribute('data-msg-id') || sel.getAttribute('data-message-id') || sel.getAttribute('data-id');
      if (v) return String(v).replace(/^[a-z]+-/, '');
    }
    return null;
  }

  // Function to extract attachments from raw MIME email
function extractAttachmentsFromRawEmail(emailContent) {
  var attachments = [];
  
  // Find all attachment parts in the MIME email
  var boundaryPattern = /boundary="([^"]+)"/i;
  var boundaryMatch = emailContent.match(boundaryPattern);
  
  if (!boundaryMatch) {
    console.log('[Alfresco] No multipart boundary found');
    return attachments;
  }
  
  var boundary = boundaryMatch[1];
  var parts = emailContent.split('--' + boundary);
  
  for (var i = 1; i < parts.length - 1; i++) {
    var part = parts[i];
    
    // Skip if this is the HTML part
    if (part.toLowerCase().includes('content-type: text/html')) {
      continue;
    }
    
    // Check if this part is an attachment
    var fileName = '';
    var contentType = 'application/octet-stream';
    var contentId = '';
    var isInline = false;
    
    // Look for filename in Content-Disposition or Content-Type
    var filenameMatch = part.match(/filename="([^"]+)"/i) || part.match(/name="([^"]+)"/i);
    if (filenameMatch) {
      fileName = filenameMatch[1];
    }
    
    // If no filename found, skip this part
    if (!fileName) {
      continue;
    }
    
    // Get Content-Type
    var contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
    if (contentTypeMatch) {
      contentType = contentTypeMatch[1].trim();
    }
    
    // Check if this is an inline attachment (embedded image)
    var dispositionMatch = part.match(/Content-Disposition:\s*(inline|attachment)/i);
    if (dispositionMatch) {
      isInline = dispositionMatch[1].toLowerCase() === 'inline';
    }
    
    // Get Content-ID for inline images
    var cidMatch = part.match(/Content-ID:\s*<([^>]+)>/i);
    if (cidMatch) {
      contentId = cidMatch[1];
      // If it has a Content-ID, it's likely an inline image
      if (contentType.startsWith('image/')) {
        isInline = true;
      }
    }
    
    // Extract base64 content
    var bodyStart = part.indexOf('\r\n\r\n');
    if (bodyStart === -1) bodyStart = part.indexOf('\n\n');
    
    if (bodyStart !== -1) {
      var base64Content = part.substring(bodyStart + 2).trim();
      // Remove any extra whitespace and newlines
      base64Content = base64Content.replace(/\s/g, '');
      
      // Calculate size
      var size = Math.ceil((base64Content.length * 3) / 4);
      
      // For regular documents (Excel, Word, PDF, etc.), force isInline to false
      var isImageFile = contentType.startsWith('image/');
      
      // Only mark as inline if it's actually an inline image
      var finalIsInline = isImageFile && isInline;
      
      attachments.push({
        id: 'att_' + i,
        fileName: fileName,
        size: size,
        contentType: contentType,
        isInline: finalIsInline,
        base64: base64Content,
        contentId: contentId
      });
      
      console.log('[Alfresco] Found attachment:', fileName, 'Size:', size, 'Type:', contentType, 'isInline:', finalIsInline);
    }
  }
  
  return attachments;
}

  // Function to parse email and extract attachments
  function parseEmailFromRfc822(emailContent) {
    console.log('[Alfresco] Parsing RFC822 email, length:', emailContent.length);
    
    var subject = '';
    var from = '';
    var to = '';
    var body = '';
    
    // Find the body separator
    var bodySeparatorIndex = emailContent.indexOf('\r\n\r\n');
    if (bodySeparatorIndex === -1) {
      bodySeparatorIndex = emailContent.indexOf('\n\n');
    }
    
    var headers = emailContent.substring(0, bodySeparatorIndex);
    var bodyContent = bodySeparatorIndex !== -1 ? emailContent.substring(bodySeparatorIndex + 2) : '';
    
    // Parse headers line by line
    var lines = headers.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var lowerLine = line.toLowerCase();
      if (lowerLine.startsWith('subject:')) {
        subject = line.substring(8).trim();
      } else if (lowerLine.startsWith('from:')) {
        from = line.substring(5).trim();
      } else if (lowerLine.startsWith('to:')) {
        to = line.substring(3).trim();
      }
    }
    
    console.log('[Alfresco] Parsed - Subject:', subject);
    console.log('[Alfresco] Parsed - From:', from);
    console.log('[Alfresco] Parsed - To:', to);
    
    // Extract attachments from the raw email
    var attachments = extractAttachmentsFromRawEmail(emailContent);
    console.log('[Alfresco] Extracted attachments:', attachments.length);
    
    // Clean body - look for HTML content
    var htmlMatch = bodyContent.match(/<html[\s\S]*?<\/html>/i);
    if (htmlMatch) {
      body = htmlMatch[0];
    } else {
      body = '<html><body><pre>' + bodyContent.replace(/[<>&]/g, function(c) {
        return ({'<': '&lt;', '>': '&gt;', '&': '&amp;'})[c];
      }) + '</pre></body></html>';
    }
    
    return {
      subject: subject || 'No Subject',
      from: from || 'unknown@domain.com',
      to: to || 'unknown recipients',
      body: body || '<html><body>No Content</body></html>',
      attachments: attachments
    };
  }

  async function buildPayload(includeAttachmentBinaries) {
    console.log('[Alfresco] Starting email extraction...');
    
    var rawId = getCurrentMessageId();
    if (!rawId) throw new Error('Could not determine current message id');
    
    // Convert negative conversation ID to positive message ID
    var msgId = rawId.charAt(0) === '-' ? rawId.substring(1) : rawId;
    console.log('[Alfresco] Using message ID:', msgId);
    
    // Use endpoint that returns raw email (RFC822 format)
    var restUrl = zimbraOrigin() + '/service/home/~/inbox?id=' + encodeURIComponent(msgId) + '&fmt=raw';
    console.log('[Alfresco] Fetching from:', restUrl);
    
    var response = await fetch(restUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch email: ' + response.status);
    
    // Get the response as text (raw email)
    var emailText = await response.text();
    console.log('[Alfresco] Email fetched! Length:', emailText.length);
    
    // Parse the raw email
    var parsed = parseEmailFromRfc822(emailText);
    
    var subject = parsed.subject;
    var from = parsed.from;
    var to = parsed.to;
    var htmlBody = parsed.body;
    var attachments = parsed.attachments;
    
    console.log('[Alfresco] Subject:', subject);
    console.log('[Alfresco] From:', from);
    console.log('[Alfresco] To:', to);
    console.log('[Alfresco] Attachments count:', attachments.length);
    
    // Log attachment details
    for (var i = 0; i < attachments.length; i++) {
      console.log('[Alfresco] Attachment', i + 1, ':', attachments[i].fileName, '-', attachments[i].size, 'bytes');
    }
    
    var safeSubject = subject.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    if (safeSubject === 'No Subject' || safeSubject === '') {
      safeSubject = 'email_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    }
    
    // Build EML
    var emlBase64DataUrl = null;
    if (includeAttachmentBinaries) {
      // Use the original email content as EML
      var emlBlob = new Blob([emailText], { type: 'message/rfc822' });
      emlBase64DataUrl = await new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function() { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(emlBlob);
      });
    }

    // In buildPayload function, replace the realAttachments filter with:
    var realAttachments = attachments.filter(function(a) { 
      // Only exclude inline images, keep all other attachments
      return !(a.isInline === true);
    });
    console.log('[Alfresco] All attachments:', attachments.length);
    console.log('[Alfresco] Real attachments (non-inline):', realAttachments.length);
    
    return {
      msgId: msgId,
      subject: subject,
      sender: from,
      recipients: to,
      fileName: safeSubject + '.eml',
      emlBase64DataUrl: emlBase64DataUrl,
      attachments: attachments,
      realAttachments: realAttachments
    };
  }

  return {
    getCurrentMessageId: getCurrentMessageId,
    buildPayload: buildPayload
  };
})();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
function showLoadingIndicator(message) {
  var existing = topDoc.getElementById('alfresco-loading');
  if (existing) existing.remove();
  
  var loading = topDoc.createElement('div');
  loading.id = 'alfresco-loading';
  loading.setAttribute('style',
    'position:fixed !important;bottom:20px !important;right:20px !important;' +
    'background:rgba(0,0,0,0.8) !important;color:white !important;padding:10px 20px !important;' +
    'border-radius:5px !important;z-index:2147483648 !important;font-family:Arial,sans-serif !important;' +
    'font-size:12px !important;'
  );
  loading.textContent = message || 'Extracting email...';
  topDoc.body.appendChild(loading);
  return loading;
}

function storeEmailDataInLocalStorage(payload) {
  console.log('[Alfresco] Storing email data - Subject:', payload.subject);
  
  localStorage.setItem('emailSubject', payload.subject);
  localStorage.setItem('emailSender', payload.sender);
  localStorage.setItem('emailRecipients', payload.recipients);
  localStorage.setItem('emailFileName', payload.fileName);
  
  if (payload.emlBase64DataUrl) {
    localStorage.setItem('savedEmailBlob', payload.emlBase64DataUrl);
  }
  
  localStorage.setItem('emailAttachments', JSON.stringify(payload.attachments));
  localStorage.setItem('RealEmailAttachments', JSON.stringify(payload.realAttachments));
  localStorage.setItem('onlyAttachments', JSON.stringify(payload.realAttachments));
  localStorage.setItem('emailDataReady', 'true');
}

// ---------------------------------------------------------------------------
// Main openAlfrescoModal - extracts email BEFORE opening modal (UNCHANGED)
// ---------------------------------------------------------------------------
function openAlfrescoModal(action) {
  console.log('[Alfresco] openAlfrescoModal called for action:', action);
  console.log('[Alfresco] Current pendingActionAfterLogin:', pendingActionAfterLogin);
  
  var existing = topDoc.getElementById('alfresco-modal-overlay');
  if (existing) existing.remove();

  var needsEmail = (action === 'alfrescosave' || action === 'selectattachment');
  
  if (needsEmail) {
    var loadingIndicator = showLoadingIndicator('Extracting email...');
    var includeBinaries = (action === 'alfrescosave');
    
    ZimbraMail.buildPayload(includeBinaries)
      .then(function(payload) {
        console.log('[Alfresco] Email extracted successfully! Subject:', payload.subject);
        storeEmailDataInLocalStorage(payload);
        if (loadingIndicator) loadingIndicator.remove();
        createModal(action, payload);
        // Clear pending action on success
        pendingActionAfterLogin = null;
      })
      .catch(function(err) {
        console.error('[Alfresco] Extraction failed:', err);
        if (loadingIndicator) loadingIndicator.remove();
        
        // Check if error indicates authentication required (401)
        var errorMsg = err.message || '';
        if (errorMsg.includes('401') || errorMsg.includes('authentication') || errorMsg.includes('login')) {
          console.log('[Alfresco] Authentication required - opening login dialog');
          // pendingActionAfterLogin is already set from menu click, just open login modal
          createModal('login', null);
        } else {
          createModal(action, null);
        }
      });
  } else {
    // For non-email actions (like alfrescoopen, login, addinversion)
    console.log('[Alfresco] Non-email action, opening modal directly');
    createModal(action, null);
  }
}

function createModal(action, payload) {
  console.log('[Alfresco] createModal called with action:', action, 'Pending action:', pendingActionAfterLogin);
  
  // If this is a login modal and we have a pending action, store it in localStorage for the login page
  if (action === 'login' && pendingActionAfterLogin) {
    console.log('[Alfresco] Login modal opened with pending action:', pendingActionAfterLogin);
    // Store in localStorage for the login page to read
    localStorage.setItem('pendingActionAfterLogin', pendingActionAfterLogin);
  }
  
  var overlay = topDoc.createElement('div');
  overlay.id = 'alfresco-modal-overlay';
  overlay.setAttribute('style',
    'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;' +
    'background:rgba(0,0,0,0.5) !important;z-index:2147483646 !important;display:flex !important;' +
    'align-items:center !important;justify-content:center !important;'
  );

  var dialog = topDoc.createElement('div');
  dialog.setAttribute('style',
    'position:relative !important;width:735px !important;max-width:94vw !important;' +
    'height:520px !important;max-height:92vh !important;background:#ffffff !important;' +
    'border-radius:10px !important;box-shadow:0 20px 50px rgba(0,0,0,0.4) !important;' +
    'overflow:hidden !important;display:flex !important;flex-direction:column !important;'
  );

  var header = topDoc.createElement('div');
  header.setAttribute('style',
    'display:flex !important;align-items:center !important;justify-content:space-between !important;' +
    'padding:10px 16px !important;background:#1a73e8 !important;color:#ffffff !important;' +
    'font-size:14px !important;font-weight:600 !important;flex-shrink:0 !important;'
  );
  
  var titleMap = {
    'login': 'Zimbra Outlook Add-on',
    'alfrescosave': 'Zimbra Outlook Add-on',
    'alfrescoopen': 'Zimbra Outlook Add-on',
    'selectattachment': 'Select Attachments',
    'addinversion': 'Add-in Version'
  };
  
  var title = topDoc.createElement('span');
  title.textContent = titleMap[action] || 'Zimbra Outlook Add-on';
  
  var closeBtn = topDoc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '\u2715';
  closeBtn.setAttribute('style',
    'background:transparent !important;border:none !important;color:#ffffff !important;' +
    'font-size:18px !important;cursor:pointer !important;padding:4px 10px !important;border-radius:4px !important;'
  );
  
  var closeModal = function() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  closeBtn.onclick = function(e) { e.stopPropagation(); closeModal(); };
  header.appendChild(title);
  header.appendChild(closeBtn);

  var iframe = topDoc.createElement('iframe');
  iframe.src = ADDIN_BASE_URL + '/dialog.html?action=' + action;
  iframe.setAttribute('style', 'flex:1 !important;width:100% !important;border:0 !important;');
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
  
  iframe.onload = function() {
    console.log('[Alfresco] iframe loaded');
    if (payload) {
      iframe.contentWindow.postMessage({ type: 'ALFRESCO_EMAIL_DATA', payload: payload }, '*');
    }
  };

  dialog.appendChild(header);
  dialog.appendChild(iframe);
  overlay.appendChild(dialog);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal();
  });

  topDoc.documentElement.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// Locate the Zimbra email toolbar and inject the button (Read Mode)
// ---------------------------------------------------------------------------
function findToolbar() {
  function labelOf(el) {
    return (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-tooltip'))) ||
      (el.textContent || '').trim();
  }

  function inSidebar(el) {
    var n = el;
    while (n && n !== topDoc.body) {
      if (n.getAttribute) {
        var role = n.getAttribute('role');
        if (role === 'tree' || role === 'treeitem' || role === 'navigation' || role === 'menu') return true;
      }
      n = n.parentElement;
    }
    return false;
  }

  var buttons = topDoc.querySelectorAll('button');
  var deleteBtn = null, replyBtn = null;
  
  for (var i = 0; i < buttons.length; i++) {
    var el = buttons[i];
    if (inSidebar(el)) continue;
    var lbl = labelOf(el);
    if (!lbl) continue;
    if (!deleteBtn && /^(delete|trash|move to trash)\b/i.test(lbl)) deleteBtn = el;
    if (!replyBtn && /^reply\b/i.test(lbl)) replyBtn = el;
  }

  if (deleteBtn && replyBtn && deleteBtn.parentElement === replyBtn.parentElement) {
    return { container: deleteBtn.parentElement, anchor: deleteBtn };
  }
  
  if (deleteBtn) {
    return { container: deleteBtn.parentElement, anchor: deleteBtn };
  }
  
  return null;
}

function tryInjectIntoToolbar() {
  // Skip injection on compose pages
  if (isComposePage()) {
    console.log('[Alfresco] Skipping read mode button injection on compose page');
    return true;
  }
  
  if (!alfrescoBtn) alfrescoBtn = buildToolbarButton();
  if (alfrescoBtn.isConnected) return true;

  var found = findToolbar();
  if (!found) return false;
  var container = found.container, anchor = found.anchor;

  if (anchor && anchor.parentElement === container) {
    if (anchor.nextSibling) container.insertBefore(alfrescoBtn, anchor.nextSibling);
    else container.appendChild(alfrescoBtn);
  } else {
    container.appendChild(alfrescoBtn);
  }
  console.log('[Alfresco] Read mode button injected into Zimbra toolbar.');
  return true;
}

// ---------------------------------------------------------------------------
// Locate the compose toolbar and inject the Add Attachment button
// ---------------------------------------------------------------------------
function findComposeToolbar() {
  var composeToolbars = topDoc.querySelectorAll('[role="toolbar"], .compose-toolbar, .editor-toolbar, [aria-label*="formatting" i], .compose-actions');
  
  for (var i = 0; i < composeToolbars.length; i++) {
    var toolbar = composeToolbars[i];
    var buttons = toolbar.querySelectorAll('button');
    if (buttons.length > 0) {
      console.log('[Alfresco] Found compose toolbar');
      return toolbar;
    }
  }
  
  var composeArea = topDoc.querySelector('.compose-container, .new-message, [data-mode="compose"]');
  if (composeArea) {
    var toolbar = composeArea.querySelector('[role="toolbar"], .toolbar');
    if (toolbar) return toolbar;
  }
  
  return null;
}

function tryInjectComposeButton() {
  if (!isComposePage()) {
    return false;
  }
  
  if (!composeBtn) composeBtn = buildComposeButton();
  if (composeBtn.isConnected) return true;
  
  var toolbar = findComposeToolbar();
  if (!toolbar) return false;
  
  toolbar.appendChild(composeBtn);
  console.log('[Alfresco] Compose button (Add Attachment(s)) injected into toolbar.');
  return true;
}

// ---------------------------------------------------------------------------
// Watch for toolbar appearing/disappearing
// ---------------------------------------------------------------------------
function startWatching() {
  // For read mode button
  var attempts = 0;
  var interval = topWin.setInterval(function() {
    attempts++;
    if (tryInjectIntoToolbar() || attempts > 60) {
      topWin.clearInterval(interval);
    }
  }, 500);

  // For compose mode button
  var composeAttempts = 0;
  var composeInterval = topWin.setInterval(function() {
    composeAttempts++;
    if (tryInjectComposeButton() || composeAttempts > 60) {
      topWin.clearInterval(composeInterval);
    }
  }, 500);

  var observer = new MutationObserver(function() {
    // Skip DOM checks during attachment process to prevent refresh
    if (isAttaching) {
      console.log('[Alfresco] Skipping observer during attachment');
      return;
    }
    
    if (!alfrescoBtn || !alfrescoBtn.isConnected) {
      tryInjectIntoToolbar();
    }
    if (!composeBtn || !composeBtn.isConnected) {
      tryInjectComposeButton();
    }
  });
  observer.observe(topDoc.body, { childList: true, subtree: true });
}

startWatching();

// ---------------------------------------------------------------------------
// Message Handler - Handles all postMessage events
// ---------------------------------------------------------------------------
topWin.addEventListener('message', function(ev) {
  if (!ev || !ev.data) return;  
  console.log('[Alfresco] Message received:', ev.data);
  console.log('[Alfresco] Message received from origin:', ev.origin);

  // If an SSO token lands at the top window, forward it to the active iframe
  if (ev.data && ev.data.type === 'SSO_TOKEN') {
    console.log('[Alfresco] Forwarding SSO_TOKEN to addattachment/dialog iframe', ev.data);
    try {
      var addIf = topDoc.querySelector('iframe[src*="/addattachment.html"]');
      if (addIf && addIf.contentWindow) {
        addIf.contentWindow.postMessage(ev.data, '*');
      } else {
        var dlgIf = topDoc.querySelector('iframe[src*="/dialog.html"]');
        if (dlgIf && dlgIf.contentWindow) dlgIf.contentWindow.postMessage(ev.data, '*');
      }
    } catch (e) {
      console.warn('[Alfresco] forward SSO_TOKEN failed', e);
    }
    return;
  }
  
  if (ev.data.type === 'ALFRESCO_DIALOG_CLOSE') {
    var ov = topDoc.getElementById('alfresco-modal-overlay');
    if (ov) ov.remove();
    var ov2 = topDoc.getElementById('alfresco-addattachment-overlay');
    if (ov2) ov2.remove();
    var sp = topDoc.getElementById('alfresco-side-panel');
    if (sp) sp.remove();
    isRightSidePanelOpen = false;
  }
  
  if (ev.data.type === 'OFFICE_MESSAGE_PARENT') {
    var msg = ev.data.payload;
    console.log('[Alfresco] OFFICE_MESSAGE_PARENT received:', msg);
    
    if (msg === 'closeDialog' || msg === 'success') {
      var ov2 = topDoc.getElementById('alfresco-modal-overlay');
      if (ov2) ov2.remove();
      var ov3 = topDoc.getElementById('alfresco-addattachment-overlay');
      if (ov3) ov3.remove();
      var sp2 = topDoc.getElementById('alfresco-side-panel');
      if (sp2) sp2.remove();
      isRightSidePanelOpen = false;
    }
    
    if (msg === 'login') {
      console.log('[Alfresco] Received login completion message from iframe');
      var ov4 = topDoc.getElementById('alfresco-modal-overlay'); if (ov4) ov4.remove();
      var ov5 = topDoc.getElementById('alfresco-addattachment-overlay'); if (ov5) ov5.remove();

      if (pendingActionAfterLogin) {
        console.log('[Alfresco] Reopening pending action after login:', pendingActionAfterLogin);
        var actionToOpen = pendingActionAfterLogin;
        pendingActionAfterLogin = null;
        localStorage.removeItem('pendingActionAfterLogin');

        setTimeout(function() {
          if (actionToOpen === 'addattachment') {
            openAddAttachmentModal();
          } else {
            openAlfrescoModal(actionToOpen);
          }
        }, 500);
      }
    }

    if (msg === 'addattachment') {
      console.log('[Alfresco] Login successful, reopening addattachment');
      var existingModal = topDoc.getElementById('alfresco-addattachment-overlay');
      if (existingModal) existingModal.remove();
      var sp3 = topDoc.getElementById('alfresco-side-panel');
      if (sp3) sp3.remove();
      isRightSidePanelOpen = false;
      
      setTimeout(function() {
        openAddAttachmentModal();
      }, 500);
    }
    
    if (msg === 'alfrescosave' || msg === 'selectattachment' || msg === 'alfrescoopen') {
      console.log('[Alfresco] Login successful, reopening dialog for action:', msg);
      var existingModal = topDoc.getElementById('alfresco-modal-overlay');
      if (existingModal) existingModal.remove();
      var sp4 = topDoc.getElementById('alfresco-side-panel');
      if (sp4) sp4.remove();
      isRightSidePanelOpen = false;
      
      setTimeout(function() {
        openAlfrescoModal(msg);
      }, 500);
    }
  } 

// Handle attachment requests
if (ev.data.type === 'ATTACH_FILE_TO_COMPOSE') {
  var fileName = ev.data.fileName;
  var base64Content = ev.data.base64Content;
  var mimeType = ev.data.mimeType;
  var messageId = ev.data.messageId;
  
  console.log('[Alfresco] Attachment request received for:', fileName);
  
  function sendResponse(success, errorMsg) {
    if (ev.source) {
      ev.source.postMessage({
        type: 'ATTACH_FILE_RESPONSE',
        success: success,
        error: errorMsg,
        messageId: messageId
      }, '*');
    }
  }
  
  // Since we're using the right-side panel, we need to handle file attachment differently
  // For now, we'll help the user by downloading the file
  try {
    var byteCharacters = atob(base64Content);
    var byteNumbers = new Array(byteCharacters.length);
    for (var i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    var byteArray = new Uint8Array(byteNumbers);
    var blob = new Blob([byteArray], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = topDoc.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    
    sendResponse(true, null);
  } catch (err) {
    sendResponse(false, err.message);
  }
}
});

console.log('[Alfresco] Ready!');
if (typeof zimlet === 'function') {
  function AlfrescoZimletHandler() {}
  AlfrescoZimletHandler.prototype.init = function() { console.log('[Alfresco] SDK init()'); };
  zimlet(AlfrescoZimletHandler);
}





























// This code is for the download and upload of attachments in Zimbra. It is injected into the Zimbra web client via the SideLoader SDK as specified in manifest.xml. The main entry point is the buildToolbarButton() function which creates a button in the email message toolbar. When clicked, it opens a dropdown menu with options to login to Alfresco, save the email to Alfresco, save attachments only, open from Alfresco, and view add-in version. The "Add Attachment(s) from Alfresco" option opens a right-side panel (taskpane-like) for browsing Alfresco and selecting files to attach to the current email. The code also includes functions for parsing raw email content to extract attachments, managing the Alfresco base URL, and handling user sessions.
// // Alfresco Zimlet for Zimbra Modern UI
// // Injects an "Alfresco Zimlet" button into the email-message toolbar
// // (next to Move / Spam / Delete).
// //
// // Note: Zimbra's SideLoader SDK runs this script inside a hidden 28x28
// // sandbox iframe, so all DOM access must be against window.top.document.

// console.log('[Alfresco] Loading...');

// var ADDIN_BASE_URL = 'https://localhost:8084';
// var LOGO_URL = ADDIN_BASE_URL + '/assets/alfresco-icon-32.png';

// // Store pending action for reopening after login - ONE SOURCE OF TRUTH
// var pendingActionAfterLogin = null;
// // Flag to indicate attachment is in progress
// var isAttaching = false;

// // // Check if we are on a compose/new email page
// // function isComposePage() {
// //   try {
// //     var url = topWin.location.href;
// //     // Check URL for compose indicators
// //     if (url.includes('/compose') || url.includes('/new') || url.includes('/edit') || url.includes('/draft')) {
// //       console.log('[Alfresco] Compose page detected via URL - will not inject button');
// //       return true;
// //     }
    
// //     // Check for compose mode in DOM (Zimbra specific)
// //     var composeElements = topDoc.querySelectorAll('[data-mode="compose"], .compose-mode, .NewMessage, .compose-container, [aria-label*="compose" i]');
// //     if (composeElements.length > 0) {
// //       console.log('[Alfresco] Compose mode detected via DOM - will not inject button');
// //       return true;
// //     }
    
// //     // Check if we're in message read mode (has email content)
// //     var readElements = topDoc.querySelectorAll('[data-msg-id], .message-view, .email-content, .conversation-view');
// //     if (readElements.length > 0) {
// //       console.log('[Alfresco] Read mode detected - will inject button');
// //       return false;
// //     }
    
// //     return false;
// //   } catch (e) {
// //     console.warn('[Alfresco] Error checking page type:', e);
// //     return false;
// //   }
// // }

// // Check if we are on a compose/new email page
// function isComposePage() {
//   try {
//     var url = topWin.location.href;
//     // Check URL for compose indicators - be more specific
//     if (url.includes('/compose') || url.includes('/new') || url.includes('/edit') || url.includes('/draft')) {
//       console.log('[Alfresco] Compose page detected via URL');
//       return true;
//     }
    
//     // Check for compose mode in DOM (Zimbra specific)
//     // Look for compose-specific elements
//     var composeElements = topDoc.querySelectorAll(
//       '[data-mode="compose"], .compose-mode, .NewMessage, .compose-container, ' +
//       '[aria-label*="compose" i], .compose-body, .email-compose, .msg-compose'
//     );
//     if (composeElements.length > 0) {
//       console.log('[Alfresco] Compose mode detected via DOM');
//       return true;
//     }
    
//     // Also check for rich text editor in compose mode
//     var editorElements = topDoc.querySelectorAll('[contenteditable="true"], .compose-editor, .message-body-editor');
//     if (editorElements.length > 0 && !url.includes('/message/') && !url.includes('/conversation/')) {
//       console.log('[Alfresco] Compose editor detected');
//       return true;
//     }
    
//     // If we have attachment button in toolbar, we're likely in compose mode
//     var attachButton = topDoc.querySelector('button[title*="Attach"], button[aria-label*="Attach"]');
//     if (attachButton && !url.includes('/message/') && !url.includes('/conversation/')) {
//       console.log('[Alfresco] Attachment button detected - likely compose mode');
//       return true;
//     }
    
//     // Check if we're in message read mode (has email content)
//     var readElements = topDoc.querySelectorAll('[data-msg-id], .message-view, .email-content, .conversation-view');
//     if (readElements.length > 0) {
//       console.log('[Alfresco] Read mode detected');
//       return false;
//     }
    
//     return false;
//   } catch (e) {
//     console.warn('[Alfresco] Error checking page type:', e);
//     return false;
//   }
// }

// // ---------------------------------------------------------------------------
// // Alfresco URL Management - Sync with manifest.xml
// // ---------------------------------------------------------------------------

// function getAlfrescoBaseUrl() {
//   var storedUrl = localStorage.getItem('Alfrecobaseurl');
//   if (storedUrl && storedUrl !== 'undefined' && storedUrl !== 'null' && storedUrl !== '') {
//     console.log('[Alfresco] Using stored Alfresco URL from localStorage:', storedUrl);
//     return storedUrl;
//   }
//   console.log('[Alfresco] Using manifest URL from ADDIN_BASE_URL:', ADDIN_BASE_URL);
//   return ADDIN_BASE_URL;
// }

// function setAlfrescoBaseUrl(url) {
//   if (url && url !== 'undefined' && url !== 'null' && url !== '') {
//     localStorage.setItem('Alfrecobaseurl', url);
//     console.log('[Alfresco] Alfresco URL updated to:', url);
//     return true;
//   }
//   return false;
// }

// function clearAlfrescoBaseUrl() {
//   localStorage.removeItem('Alfrecobaseurl');
//   console.log('[Alfresco] Alfresco URL cleared');
// }

// window.AlfrescoZimletUrl = {
//   getBaseUrl: getAlfrescoBaseUrl,
//   setBaseUrl: setAlfrescoBaseUrl,
//   clearBaseUrl: clearAlfrescoBaseUrl
// };

// function getTopDoc() {
//   try {
//     return (window.top && window.top.document) ? window.top.document : document;
//   } catch (e) {
//     console.warn('[Alfresco] Cannot access window.top:', e.message);
//     return document;
//   }
// }

// var topDoc = getTopDoc();
// var topWin = topDoc.defaultView || window.top || window;

// // ---------------------------------------------------------------------------
// // Build the read mode button element (single instance, reused on every re-mount)
// // ---------------------------------------------------------------------------
// function buildToolbarButton() {
//   var btn = topDoc.createElement('button');
//   btn.id = 'alfresco-toolbar-btn';
//   btn.type = 'button';
//   btn.title = 'Alfresco Zimlet';
//   btn.setAttribute('style',
//     'display:inline-flex !important;' +
//     'align-items:center !important;' +
//     'gap:6px !important;' +
//     'background:transparent !important;' +
//     'border:none !important;' +
//     'color:#1a73e8 !important;' +
//     'cursor:pointer !important;' +
//     'padding:6px 10px !important;' +
//     'margin:0 4px !important;' +
//     'font-family:inherit !important;' +
//     'font-size:13px !important;' +
//     'font-weight:500 !important;' +
//     'border-radius:4px !important;' +
//     'white-space:nowrap !important;' +
//     'vertical-align:middle !important;'
//   );

//   var img = topDoc.createElement('img');
//   img.src = LOGO_URL;
//   img.alt = 'Alfresco';
//   img.setAttribute('style', 'width:18px !important;height:18px !important;display:inline-block !important;');
//   img.onerror = function() { img.style.display = 'none'; };

//   var span = topDoc.createElement('span');
//   span.textContent = 'Alfresco Zimlet';

//   btn.appendChild(img);
//   btn.appendChild(span);

//   btn.onmouseover = function() { btn.style.background = '#e8f0fe'; };
//   btn.onmouseout  = function() { btn.style.background = 'transparent'; };

//   // Dropdown menu
//   var menu = null;
//   btn.onclick = function(e) {
//     e.stopPropagation();
//     if (menu) { menu.remove(); menu = null; return; }

//     var rect = btn.getBoundingClientRect();
//     menu = topDoc.createElement('div');
//     menu.id = 'alfresco-menu';
//     menu.setAttribute('style',
//       'position:fixed !important;' +
//       'top:' + (rect.bottom + 4) + 'px !important;' +
//       'left:' + Math.max(8, rect.right - 240) + 'px !important;' +
//       'background:#ffffff !important;' +
//       'border:1px solid #e0e0e0 !important;' +
//       'border-radius:6px !important;' +
//       'box-shadow:0 4px 16px rgba(0,0,0,0.18) !important;' +
//       'min-width:240px !important;' +
//       'z-index:2147483647 !important;' +
//       'font-family:Arial,sans-serif !important;' +
//       'overflow:hidden !important;'
//     );

//     [
//       { action: 'login',            label: 'Login to Alfresco',        icon: ADDIN_BASE_URL + '/assets/login-icon-32.png' },
//       { action: 'alfrescosave',     label: 'Save to Alfresco',         icon: ADDIN_BASE_URL + '/assets/save-icon-32.png' },
//       { action: 'selectattachment', label: 'Save Attachment(s) Only',  icon: ADDIN_BASE_URL + '/assets/attachment-icon-32.png' },
//       { action: 'alfrescoopen',     label: 'Open from Alfresco',       icon: ADDIN_BASE_URL + '/assets/open-icon-32.png' },
//       { action: 'addinversion',     label: 'Add-in Version',           icon: ADDIN_BASE_URL + '/assets/alfresco-icon-32.png' }
//     ].forEach(function(item) {
//       var mi = topDoc.createElement('div');
//       mi.setAttribute('style',
//         'display:flex !important;align-items:center !important;gap:10px !important;' +
//         'padding:10px 14px;cursor:pointer;font-size:13px;color:#333;' +
//         'border-bottom:1px solid #f0f0f0;background:white;white-space:nowrap;'
//       );
//       var iconImg = topDoc.createElement('img');
//       iconImg.src = item.icon;
//       iconImg.alt = '';
//       iconImg.setAttribute('style', 'width:18px;height:18px;flex-shrink:0;');
//       iconImg.onerror = function() { iconImg.style.display = 'none'; };
//       var labelSpan = topDoc.createElement('span');
//       labelSpan.textContent = item.label;
//       mi.appendChild(iconImg);
//       mi.appendChild(labelSpan);
//       mi.onmouseover = function() { mi.style.background = '#e8f0fe'; };
//       mi.onmouseout  = function() { mi.style.background = 'white'; };
//       mi.onclick = function() {
//         // Store the action before opening modal for potential reopening after login
//         console.log('[Alfresco] Menu clicked - action:', item.action);
//         pendingActionAfterLogin = item.action;
//         openAlfrescoModal(item.action);
//         if (menu) { menu.remove(); menu = null; }
//       };
//       menu.appendChild(mi);
//     });

//     topDoc.body.appendChild(menu);
//   };

//   topDoc.addEventListener('click', function(e) {
//     if (menu && !btn.contains(e.target) && !menu.contains(e.target)) {
//       menu.remove(); menu = null;
//     }
//   });

//   return btn;
// }

// var alfrescoBtn = null;

// // ---------------------------------------------------------------------------
// // Build the compose mode button element (Add Attachment(s))
// // ---------------------------------------------------------------------------
// function buildComposeButton() {
//   var btn = topDoc.createElement('button');
//   btn.id = 'alfresco-compose-btn';
//   btn.type = 'button';
//   btn.title = 'Add Attachment(s) from Alfresco';
//   btn.setAttribute('style',
//     'display:inline-flex !important;' +
//     'align-items:center !important;' +
//     'gap:6px !important;' +
//     'background:transparent !important;' +
//     'border:none !important;' +
//     'color:#1a73e8 !important;' +
//     'cursor:pointer !important;' +
//     'padding:6px 10px !important;' +
//     'margin:0 4px !important;' +
//     'font-family:inherit !important;' +
//     'font-size:13px !important;' +
//     'font-weight:500 !important;' +
//     'border-radius:4px !important;' +
//     'white-space:nowrap !important;' +
//     'vertical-align:middle !important;'
//   );

//   var img = topDoc.createElement('img');
//   img.src = LOGO_URL;
//   img.alt = 'Alfresco';
//   img.setAttribute('style', 'width:18px !important;height:18px !important;display:inline-block !important;');
//   img.onerror = function() { img.style.display = 'none'; };

//   var span = topDoc.createElement('span');
//   span.textContent = 'Add Attachment(s)';

//   btn.appendChild(img);
//   btn.appendChild(span);

//   btn.onmouseover = function() { btn.style.background = '#e8f0fe'; };
//   btn.onmouseout = function() { btn.style.background = 'transparent'; };

//   btn.onclick = function(e) {
//     e.stopPropagation();
//     console.log('[Alfresco] Add Attachment(s) button clicked');
//     openAddAttachmentModal();
//   };

//   return btn;
// }

// var composeBtn = null;

// // ---------------------------------------------------------------------------
// // Open Right-Side Panel (taskpane-like) for compose pages
// // ---------------------------------------------------------------------------
// function openRightSidePanel() {
//   console.log('[Alfresco] Opening right-side panel for compose');

//   // Remove existing side panel if any
//   var existingPanel = topDoc.getElementById('alfresco-side-panel');
//   if (existingPanel) existingPanel.remove();

//   var panel = topDoc.createElement('div');
//   panel.id = 'alfresco-side-panel';
//   panel.setAttribute('style',
//     'position:fixed !important;top:64px !important;right:0 !important;height:calc(100vh - 64px) !important;' +
//     'width:360px !important;max-width:40vw !important;background:#ffffff !important;' +
//     'box-shadow: -6px 0 18px rgba(0,0,0,0.2) !important;z-index:2147483647 !important;display:flex !important;flex-direction:column !important;cursor:default !important;'
//   );

//   var header = topDoc.createElement('div');
//   header.setAttribute('style', 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f4f6f8;border-bottom:1px solid #e6e9ee;flex-shrink:0;cursor:grab;');
//   var title = topDoc.createElement('span');
//   title.textContent = 'Add Attachment(s)';
//   title.setAttribute('style', 'font-weight:600;color:#333');
//   var closeBtn = topDoc.createElement('button');
//   closeBtn.type = 'button';
//   closeBtn.textContent = '\u2715';
//   closeBtn.setAttribute('style', 'background:transparent;border:none;font-size:16px;cursor:pointer;padding:4px;color:#666');
//   closeBtn.onclick = function(e) { e.stopPropagation(); if (panel.parentNode) panel.parentNode.removeChild(panel); };
//   header.appendChild(title);
//   header.appendChild(closeBtn);

//   var iframe = topDoc.createElement('iframe');
//   iframe.src = ADDIN_BASE_URL + '/addattachment.html?action=addattachment&compose=true';
//   iframe.setAttribute('style', 'flex:1 !important;width:100% !important;border:0 !important;min-height:0 !important;');
//   iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

//   panel.appendChild(header);
//   panel.appendChild(iframe);

//   topDoc.documentElement.appendChild(panel);

//   // Make the panel draggable by header
//   (function makeDraggable(target, handle) {
//     var isDragging = false;
//     var startX = 0, startY = 0;
//     var startLeft = 0, startTop = 0;

//     function onMouseDown(e) {
//       if (e.button !== 0) return;
//       isDragging = true;
//       startX = e.clientX;
//       startY = e.clientY;
//       var rect = target.getBoundingClientRect();
//       startLeft = rect.left;
//       startTop = rect.top;
//       target.style.right = 'auto';
//       target.style.left = startLeft + 'px';
//       target.style.top = startTop + 'px';
//       target.style.bottom = 'auto';
//       handle.style.cursor = 'grabbing';
//       document.addEventListener('mousemove', onMouseMove);
//       document.addEventListener('mouseup', onMouseUp);
//       e.preventDefault();
//     }

//     function onMouseMove(e) {
//       if (!isDragging) return;
//       var dx = e.clientX - startX;
//       var dy = e.clientY - startY;
//       var newLeft = startLeft + dx;
//       var newTop = Math.max(8, startTop + dy);
//       var maxLeft = (topWin.innerWidth || topDoc.documentElement.clientWidth) - target.offsetWidth - 8;
//       newLeft = Math.min(Math.max(8, newLeft), maxLeft);
//       var maxTop = (topWin.innerHeight || topDoc.documentElement.clientHeight) - target.offsetHeight - 8;
//       newTop = Math.min(Math.max(8, newTop), Math.max(8, maxTop));
//       target.style.left = newLeft + 'px';
//       target.style.top = newTop + 'px';
//     }

//     function onMouseUp() {
//       if (!isDragging) return;
//       isDragging = false;
//       handle.style.cursor = 'grab';
//       document.removeEventListener('mousemove', onMouseMove);
//       document.removeEventListener('mouseup', onMouseUp);
//     }

//     handle.addEventListener('mousedown', onMouseDown);
//     handle.addEventListener('dblclick', function() {
//       target.style.right = '0';
//       target.style.left = 'auto';
//       target.style.top = '64px';
//     });
//   })(panel, header);
// }

// // ---------------------------------------------------------------------------
// // Open Add Attachment Modal
// // ---------------------------------------------------------------------------
// function openAddAttachmentModal() {
//   console.log('[Alfresco] Opening Add Attachment dialog');
  
//   // If we're on a compose page, prefer opening a right-side panel (taskpane-like)
//   if (isComposePage()) {
//     openRightSidePanel();
//     return;
//   }
//   // Remove existing modal if any
//   var existing = topDoc.getElementById('alfresco-addattachment-overlay');
//   if (existing) existing.remove();
  
//   var overlay = topDoc.createElement('div');
//   overlay.id = 'alfresco-addattachment-overlay';
//   overlay.setAttribute('style',
//     'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;' +
//     'background:rgba(0,0,0,0.5) !important;z-index:2147483646 !important;display:flex !important;' +
//     'align-items:center !important;justify-content:center !important;'
//   );

//   var dialog = topDoc.createElement('div');
//   dialog.setAttribute('style',
//     'position:relative !important;width:735px !important;max-width:94vw !important;' +
//     'height:520px !important;max-height:92vh !important;background:#ffffff !important;' +
//     'border-radius:10px !important;box-shadow:0 20px 50px rgba(0,0,0,0.4) !important;' +
//     'overflow:hidden !important;display:flex !important;flex-direction:column !important;'
//   );

//   var header = topDoc.createElement('div');
//   header.setAttribute('style',
//     'display:flex !important;align-items:center !important;justify-content:space-between !important;' +
//     'padding:10px 16px !important;background:#1a73e8 !important;color:#ffffff !important;' +
//     'font-size:14px !important;font-weight:600 !important;flex-shrink:0 !important;'
//   );
  
//   var title = topDoc.createElement('span');
//   title.textContent = 'Add Attachment from Alfresco';
  
//   var closeBtn = topDoc.createElement('button');
//   closeBtn.type = 'button';
//   closeBtn.textContent = '\u2715';
//   closeBtn.setAttribute('style',
//     'background:transparent !important;border:none !important;color:#ffffff !important;' +
//     'font-size:18px !important;cursor:pointer !important;padding:4px 10px !important;border-radius:4px !important;'
//   );
  
//   var closeModal = function() {
//     if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
//   };
//   closeBtn.onclick = function(e) { e.stopPropagation(); closeModal(); };
//   header.appendChild(title);
//   header.appendChild(closeBtn);

//   var iframe = topDoc.createElement('iframe');
//   iframe.src = ADDIN_BASE_URL + '/addattachment.html?action=addattachment&compose=true';
//   iframe.setAttribute('style', 'flex:1 !important;width:100% !important;border:0 !important;');
//   iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

//   dialog.appendChild(header);
//   dialog.appendChild(iframe);
//   overlay.appendChild(dialog);

//   overlay.addEventListener('click', function(e) {
//     if (e.target === overlay) closeModal();
//   });

//   topDoc.documentElement.appendChild(overlay);
// }

// // ---------------------------------------------------------------------------
// // MODIFIED: Zimbra email extraction - Parse raw email with attachments
// // ---------------------------------------------------------------------------
// var ZimbraMail = (function () {
//   function zimbraOrigin() { return topWin.location.origin; }

//   function getCurrentMessageId() {
//     // Get from URL
//     var m = topWin.location.pathname.match(/\/(?:message|conversation)\/(-?\d+)/);
//     if (m) {
//       console.log('[Alfresco] MessageId from URL:', m[1]);
//       return m[1];
//     }
    
//     // Fallback to DOM
//     var sel = topDoc.querySelector('[data-msg-id], [data-message-id], [data-id^="msg-"], [data-id^="m-"]');
//     if (sel) {
//       var v = sel.getAttribute('data-msg-id') || sel.getAttribute('data-message-id') || sel.getAttribute('data-id');
//       if (v) return String(v).replace(/^[a-z]+-/, '');
//     }
//     return null;
//   }

//   // Function to extract attachments from raw MIME email
// function extractAttachmentsFromRawEmail(emailContent) {
//   var attachments = [];
  
//   // Find all attachment parts in the MIME email
//   var boundaryPattern = /boundary="([^"]+)"/i;
//   var boundaryMatch = emailContent.match(boundaryPattern);
  
//   if (!boundaryMatch) {
//     console.log('[Alfresco] No multipart boundary found');
//     return attachments;
//   }
  
//   var boundary = boundaryMatch[1];
//   var parts = emailContent.split('--' + boundary);
  
//   for (var i = 1; i < parts.length - 1; i++) {
//     var part = parts[i];
    
//     // Skip if this is the HTML part
//     if (part.toLowerCase().includes('content-type: text/html')) {
//       continue;
//     }
    
//     // Check if this part is an attachment
//     var fileName = '';
//     var contentType = 'application/octet-stream';
//     var contentId = '';
//     var isInline = false;
    
//     // Look for filename in Content-Disposition or Content-Type
//     var filenameMatch = part.match(/filename="([^"]+)"/i) || part.match(/name="([^"]+)"/i);
//     if (filenameMatch) {
//       fileName = filenameMatch[1];
//     }
    
//     // If no filename found, skip this part
//     if (!fileName) {
//       continue;
//     }
    
//     // Get Content-Type
//     var contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
//     if (contentTypeMatch) {
//       contentType = contentTypeMatch[1].trim();
//     }
    
//     // Check if this is an inline attachment (embedded image)
//     var dispositionMatch = part.match(/Content-Disposition:\s*(inline|attachment)/i);
//     if (dispositionMatch) {
//       isInline = dispositionMatch[1].toLowerCase() === 'inline';
//     }
    
//     // Get Content-ID for inline images
//     var cidMatch = part.match(/Content-ID:\s*<([^>]+)>/i);
//     if (cidMatch) {
//       contentId = cidMatch[1];
//       // If it has a Content-ID, it's likely an inline image
//       if (contentType.startsWith('image/')) {
//         isInline = true;
//       }
//     }
    
//     // Extract base64 content
//     var bodyStart = part.indexOf('\r\n\r\n');
//     if (bodyStart === -1) bodyStart = part.indexOf('\n\n');
    
//     if (bodyStart !== -1) {
//       var base64Content = part.substring(bodyStart + 2).trim();
//       // Remove any extra whitespace and newlines
//       base64Content = base64Content.replace(/\s/g, '');
      
//       // Calculate size
//       var size = Math.ceil((base64Content.length * 3) / 4);
      
//       // For regular documents (Excel, Word, PDF, etc.), force isInline to false
//       var isImageFile = contentType.startsWith('image/');
      
//       // Only mark as inline if it's actually an inline image
//       var finalIsInline = isImageFile && isInline;
      
//       attachments.push({
//         id: 'att_' + i,
//         fileName: fileName,
//         size: size,
//         contentType: contentType,
//         isInline: finalIsInline,
//         base64: base64Content,
//         contentId: contentId
//       });
      
//       console.log('[Alfresco] Found attachment:', fileName, 'Size:', size, 'Type:', contentType, 'isInline:', finalIsInline);
//     }
//   }
  
//   return attachments;
// }

//   // Function to parse email and extract attachments
//   function parseEmailFromRfc822(emailContent) {
//     console.log('[Alfresco] Parsing RFC822 email, length:', emailContent.length);
    
//     var subject = '';
//     var from = '';
//     var to = '';
//     var body = '';
    
//     // Find the body separator
//     var bodySeparatorIndex = emailContent.indexOf('\r\n\r\n');
//     if (bodySeparatorIndex === -1) {
//       bodySeparatorIndex = emailContent.indexOf('\n\n');
//     }
    
//     var headers = emailContent.substring(0, bodySeparatorIndex);
//     var bodyContent = bodySeparatorIndex !== -1 ? emailContent.substring(bodySeparatorIndex + 2) : '';
    
//     // Parse headers line by line
//     var lines = headers.split(/\r?\n/);
//     for (var i = 0; i < lines.length; i++) {
//       var line = lines[i];
//       var lowerLine = line.toLowerCase();
//       if (lowerLine.startsWith('subject:')) {
//         subject = line.substring(8).trim();
//       } else if (lowerLine.startsWith('from:')) {
//         from = line.substring(5).trim();
//       } else if (lowerLine.startsWith('to:')) {
//         to = line.substring(3).trim();
//       }
//     }
    
//     console.log('[Alfresco] Parsed - Subject:', subject);
//     console.log('[Alfresco] Parsed - From:', from);
//     console.log('[Alfresco] Parsed - To:', to);
    
//     // Extract attachments from the raw email
//     var attachments = extractAttachmentsFromRawEmail(emailContent);
//     console.log('[Alfresco] Extracted attachments:', attachments.length);
    
//     // Clean body - look for HTML content
//     var htmlMatch = bodyContent.match(/<html[\s\S]*?<\/html>/i);
//     if (htmlMatch) {
//       body = htmlMatch[0];
//     } else {
//       body = '<html><body><pre>' + bodyContent.replace(/[<>&]/g, function(c) {
//         return ({'<': '&lt;', '>': '&gt;', '&': '&amp;'})[c];
//       }) + '</pre></body></html>';
//     }
    
//     return {
//       subject: subject || 'No Subject',
//       from: from || 'unknown@domain.com',
//       to: to || 'unknown recipients',
//       body: body || '<html><body>No Content</body></html>',
//       attachments: attachments
//     };
//   }

//   async function buildPayload(includeAttachmentBinaries) {
//     console.log('[Alfresco] Starting email extraction...');
    
//     var rawId = getCurrentMessageId();
//     if (!rawId) throw new Error('Could not determine current message id');
    
//     // Convert negative conversation ID to positive message ID
//     var msgId = rawId.charAt(0) === '-' ? rawId.substring(1) : rawId;
//     console.log('[Alfresco] Using message ID:', msgId);
    
//     // Use endpoint that returns raw email (RFC822 format)
//     var restUrl = zimbraOrigin() + '/service/home/~/inbox?id=' + encodeURIComponent(msgId) + '&fmt=raw';
//     console.log('[Alfresco] Fetching from:', restUrl);
    
//     var response = await fetch(restUrl, { credentials: 'include' });
//     if (!response.ok) throw new Error('Failed to fetch email: ' + response.status);
    
//     // Get the response as text (raw email)
//     var emailText = await response.text();
//     console.log('[Alfresco] Email fetched! Length:', emailText.length);
    
//     // Parse the raw email
//     var parsed = parseEmailFromRfc822(emailText);
    
//     var subject = parsed.subject;
//     var from = parsed.from;
//     var to = parsed.to;
//     var htmlBody = parsed.body;
//     var attachments = parsed.attachments;
    
//     console.log('[Alfresco] Subject:', subject);
//     console.log('[Alfresco] From:', from);
//     console.log('[Alfresco] To:', to);
//     console.log('[Alfresco] Attachments count:', attachments.length);
    
//     // Log attachment details
//     for (var i = 0; i < attachments.length; i++) {
//       console.log('[Alfresco] Attachment', i + 1, ':', attachments[i].fileName, '-', attachments[i].size, 'bytes');
//     }
    
//     var safeSubject = subject.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
//     if (safeSubject === 'No Subject' || safeSubject === '') {
//       safeSubject = 'email_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-');
//     }
    
//     // Build EML
//     var emlBase64DataUrl = null;
//     if (includeAttachmentBinaries) {
//       // Use the original email content as EML
//       var emlBlob = new Blob([emailText], { type: 'message/rfc822' });
//       emlBase64DataUrl = await new Promise(function(resolve, reject) {
//         var reader = new FileReader();
//         reader.onloadend = function() { resolve(reader.result); };
//         reader.onerror = reject;
//         reader.readAsDataURL(emlBlob);
//       });
//     }

//     // In buildPayload function, replace the realAttachments filter with:
//     var realAttachments = attachments.filter(function(a) { 
//       // Only exclude inline images, keep all other attachments
//       return !(a.isInline === true);
//     });
//     console.log('[Alfresco] All attachments:', attachments.length);
//     console.log('[Alfresco] Real attachments (non-inline):', realAttachments.length);
    
//     return {
//       msgId: msgId,
//       subject: subject,
//       sender: from,
//       recipients: to,
//       fileName: safeSubject + '.eml',
//       emlBase64DataUrl: emlBase64DataUrl,
//       attachments: attachments,
//       realAttachments: realAttachments
//     };
//   }

//   return {
//     getCurrentMessageId: getCurrentMessageId,
//     buildPayload: buildPayload
//   };
// })();

// // ---------------------------------------------------------------------------
// // Helper functions
// // ---------------------------------------------------------------------------
// function showLoadingIndicator(message) {
//   var existing = topDoc.getElementById('alfresco-loading');
//   if (existing) existing.remove();
  
//   var loading = topDoc.createElement('div');
//   loading.id = 'alfresco-loading';
//   loading.setAttribute('style',
//     'position:fixed !important;bottom:20px !important;right:20px !important;' +
//     'background:rgba(0,0,0,0.8) !important;color:white !important;padding:10px 20px !important;' +
//     'border-radius:5px !important;z-index:2147483648 !important;font-family:Arial,sans-serif !important;' +
//     'font-size:12px !important;'
//   );
//   loading.textContent = message || 'Extracting email...';
//   topDoc.body.appendChild(loading);
//   return loading;
// }

// function storeEmailDataInLocalStorage(payload) {
//   console.log('[Alfresco] Storing email data - Subject:', payload.subject);
  
//   localStorage.setItem('emailSubject', payload.subject);
//   localStorage.setItem('emailSender', payload.sender);
//   localStorage.setItem('emailRecipients', payload.recipients);
//   localStorage.setItem('emailFileName', payload.fileName);
  
//   if (payload.emlBase64DataUrl) {
//     localStorage.setItem('savedEmailBlob', payload.emlBase64DataUrl);
//   }
  
//   localStorage.setItem('emailAttachments', JSON.stringify(payload.attachments));
//   localStorage.setItem('RealEmailAttachments', JSON.stringify(payload.realAttachments));
//   localStorage.setItem('onlyAttachments', JSON.stringify(payload.realAttachments));
//   localStorage.setItem('emailDataReady', 'true');
// }

// // ---------------------------------------------------------------------------
// // Main openAlfrescoModal - extracts email BEFORE opening modal (UNCHANGED)
// // ---------------------------------------------------------------------------
// function openAlfrescoModal(action) {
//   console.log('[Alfresco] openAlfrescoModal called for action:', action);
//   console.log('[Alfresco] Current pendingActionAfterLogin:', pendingActionAfterLogin);
  
//   var existing = topDoc.getElementById('alfresco-modal-overlay');
//   if (existing) existing.remove();

//   var needsEmail = (action === 'alfrescosave' || action === 'selectattachment');
  
//   if (needsEmail) {
//     var loadingIndicator = showLoadingIndicator('Extracting email...');
//     var includeBinaries = (action === 'alfrescosave');
    
//     ZimbraMail.buildPayload(includeBinaries)
//       .then(function(payload) {
//         console.log('[Alfresco] Email extracted successfully! Subject:', payload.subject);
//         storeEmailDataInLocalStorage(payload);
//         if (loadingIndicator) loadingIndicator.remove();
//         createModal(action, payload);
//         // Clear pending action on success
//         pendingActionAfterLogin = null;
//       })
//       .catch(function(err) {
//         console.error('[Alfresco] Extraction failed:', err);
//         if (loadingIndicator) loadingIndicator.remove();
        
//         // Check if error indicates authentication required (401)
//         var errorMsg = err.message || '';
//         if (errorMsg.includes('401') || errorMsg.includes('authentication') || errorMsg.includes('login')) {
//           console.log('[Alfresco] Authentication required - opening login dialog');
//           // pendingActionAfterLogin is already set from menu click, just open login modal
//           createModal('login', null);
//         } else {
//           createModal(action, null);
//         }
//       });
//   } else {
//     // For non-email actions (like alfrescoopen, login, addinversion)
//     console.log('[Alfresco] Non-email action, opening modal directly');
//     createModal(action, null);
//   }
// }

// function createModal(action, payload) {
//   console.log('[Alfresco] createModal called with action:', action, 'Pending action:', pendingActionAfterLogin);
  
//   // If this is a login modal and we have a pending action, store it in localStorage for the login page
//   if (action === 'login' && pendingActionAfterLogin) {
//     console.log('[Alfresco] Login modal opened with pending action:', pendingActionAfterLogin);
//     // Store in localStorage for the login page to read
//     localStorage.setItem('pendingActionAfterLogin', pendingActionAfterLogin);
//   }
  
//   var overlay = topDoc.createElement('div');
//   overlay.id = 'alfresco-modal-overlay';
//   overlay.setAttribute('style',
//     'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;' +
//     'background:rgba(0,0,0,0.5) !important;z-index:2147483646 !important;display:flex !important;' +
//     'align-items:center !important;justify-content:center !important;'
//   );

//   var dialog = topDoc.createElement('div');
//   dialog.setAttribute('style',
//     'position:relative !important;width:735px !important;max-width:94vw !important;' +
//     'height:520px !important;max-height:92vh !important;background:#ffffff !important;' +
//     'border-radius:10px !important;box-shadow:0 20px 50px rgba(0,0,0,0.4) !important;' +
//     'overflow:hidden !important;display:flex !important;flex-direction:column !important;'
//   );

//   var header = topDoc.createElement('div');
//   header.setAttribute('style',
//     'display:flex !important;align-items:center !important;justify-content:space-between !important;' +
//     'padding:10px 16px !important;background:#1a73e8 !important;color:#ffffff !important;' +
//     'font-size:14px !important;font-weight:600 !important;flex-shrink:0 !important;'
//   );
  
//   var titleMap = {
//     'login': 'Zimbra Outlook Add-on',
//     'alfrescosave': 'Zimbra Outlook Add-on',
//     'alfrescoopen': 'Zimbra Outlook Add-on',
//     'selectattachment': 'Select Attachments',
//     'addinversion': 'Add-in Version'
//   };
  
//   var title = topDoc.createElement('span');
//   title.textContent = titleMap[action] || 'Zimbra Outlook Add-on';
  
//   var closeBtn = topDoc.createElement('button');
//   closeBtn.type = 'button';
//   closeBtn.textContent = '\u2715';
//   closeBtn.setAttribute('style',
//     'background:transparent !important;border:none !important;color:#ffffff !important;' +
//     'font-size:18px !important;cursor:pointer !important;padding:4px 10px !important;border-radius:4px !important;'
//   );
  
//   var closeModal = function() {
//     if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
//   };
//   closeBtn.onclick = function(e) { e.stopPropagation(); closeModal(); };
//   header.appendChild(title);
//   header.appendChild(closeBtn);

//   var iframe = topDoc.createElement('iframe');
//   iframe.src = ADDIN_BASE_URL + '/dialog.html?action=' + action;
//   iframe.setAttribute('style', 'flex:1 !important;width:100% !important;border:0 !important;');
//   iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
  
//   iframe.onload = function() {
//     console.log('[Alfresco] iframe loaded');
//     if (payload) {
//       iframe.contentWindow.postMessage({ type: 'ALFRESCO_EMAIL_DATA', payload: payload }, '*');
//     }
//   };

//   dialog.appendChild(header);
//   dialog.appendChild(iframe);
//   overlay.appendChild(dialog);

//   overlay.addEventListener('click', function(e) {
//     if (e.target === overlay) closeModal();
//   });

//   topDoc.documentElement.appendChild(overlay);
// }

// // ---------------------------------------------------------------------------
// // Locate the Zimbra email toolbar and inject the button (Read Mode)
// // ---------------------------------------------------------------------------
// function findToolbar() {
//   function labelOf(el) {
//     return (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-tooltip'))) ||
//       (el.textContent || '').trim();
//   }

//   function inSidebar(el) {
//     var n = el;
//     while (n && n !== topDoc.body) {
//       if (n.getAttribute) {
//         var role = n.getAttribute('role');
//         if (role === 'tree' || role === 'treeitem' || role === 'navigation' || role === 'menu') return true;
//       }
//       n = n.parentElement;
//     }
//     return false;
//   }

//   var buttons = topDoc.querySelectorAll('button');
//   var deleteBtn = null, replyBtn = null;
  
//   for (var i = 0; i < buttons.length; i++) {
//     var el = buttons[i];
//     if (inSidebar(el)) continue;
//     var lbl = labelOf(el);
//     if (!lbl) continue;
//     if (!deleteBtn && /^(delete|trash|move to trash)\b/i.test(lbl)) deleteBtn = el;
//     if (!replyBtn && /^reply\b/i.test(lbl)) replyBtn = el;
//   }

//   if (deleteBtn && replyBtn && deleteBtn.parentElement === replyBtn.parentElement) {
//     return { container: deleteBtn.parentElement, anchor: deleteBtn };
//   }
  
//   if (deleteBtn) {
//     return { container: deleteBtn.parentElement, anchor: deleteBtn };
//   }
  
//   return null;
// }

// function tryInjectIntoToolbar() {
//   // Skip injection on compose pages
//   if (isComposePage()) {
//     console.log('[Alfresco] Skipping read mode button injection on compose page');
//     return true;
//   }
  
//   if (!alfrescoBtn) alfrescoBtn = buildToolbarButton();
//   if (alfrescoBtn.isConnected) return true;

//   var found = findToolbar();
//   if (!found) return false;
//   var container = found.container, anchor = found.anchor;

//   if (anchor && anchor.parentElement === container) {
//     if (anchor.nextSibling) container.insertBefore(alfrescoBtn, anchor.nextSibling);
//     else container.appendChild(alfrescoBtn);
//   } else {
//     container.appendChild(alfrescoBtn);
//   }
//   console.log('[Alfresco] Read mode button injected into Zimbra toolbar.');
//   return true;
// }

// // ---------------------------------------------------------------------------
// // Locate the compose toolbar and inject the Add Attachment button
// // ---------------------------------------------------------------------------
// function findComposeToolbar() {
//   var composeToolbars = topDoc.querySelectorAll('[role="toolbar"], .compose-toolbar, .editor-toolbar, [aria-label*="formatting" i], .compose-actions');
  
//   for (var i = 0; i < composeToolbars.length; i++) {
//     var toolbar = composeToolbars[i];
//     var buttons = toolbar.querySelectorAll('button');
//     if (buttons.length > 0) {
//       console.log('[Alfresco] Found compose toolbar');
//       return toolbar;
//     }
//   }
  
//   var composeArea = topDoc.querySelector('.compose-container, .new-message, [data-mode="compose"]');
//   if (composeArea) {
//     var toolbar = composeArea.querySelector('[role="toolbar"], .toolbar');
//     if (toolbar) return toolbar;
//   }
  
//   return null;
// }

// function tryInjectComposeButton() {
//   if (!isComposePage()) {
//     return false;
//   }
  
//   if (!composeBtn) composeBtn = buildComposeButton();
//   if (composeBtn.isConnected) return true;
  
//   var toolbar = findComposeToolbar();
//   if (!toolbar) return false;
  
//   toolbar.appendChild(composeBtn);
//   console.log('[Alfresco] Compose button (Add Attachment(s)) injected into toolbar.');
//   return true;
// }

// // ---------------------------------------------------------------------------
// // Watch for toolbar appearing/disappearing
// // ---------------------------------------------------------------------------
// function startWatching() {
//   // For read mode button
//   var attempts = 0;
//   var interval = topWin.setInterval(function() {
//     attempts++;
//     if (tryInjectIntoToolbar() || attempts > 60) {
//       topWin.clearInterval(interval);
//     }
//   }, 500);

//   // For compose mode button
//   var composeAttempts = 0;
//   var composeInterval = topWin.setInterval(function() {
//     composeAttempts++;
//     if (tryInjectComposeButton() || composeAttempts > 60) {
//       topWin.clearInterval(composeInterval);
//     }
//   }, 500);

//   var observer = new MutationObserver(function() {
//     // Skip DOM checks during attachment process to prevent refresh
//     if (isAttaching) {
//       console.log('[Alfresco] Skipping observer during attachment');
//       return;
//     }
    
//     if (!alfrescoBtn || !alfrescoBtn.isConnected) {
//       tryInjectIntoToolbar();
//     }
//     if (!composeBtn || !composeBtn.isConnected) {
//       tryInjectComposeButton();
//     }
//   });
//   observer.observe(topDoc.body, { childList: true, subtree: true });
// }

// startWatching();

// // ---------------------------------------------------------------------------
// // Message Handler - Handles all postMessage events
// // ---------------------------------------------------------------------------
// topWin.addEventListener('message', function(ev) {
//   if (!ev || !ev.data) return;  
//   console.log('[Alfresco] Message received:', ev.data);
//   // Log origin for debugging but don't reject
//   console.log('[Alfresco] Message received from origin:', ev.origin);

//   // If an SSO token lands at the top window (e.g. IdP redirected a popup),
//   // forward it into the active addattachment/dialog iframe so the in-iframe
//   // SSO handler can pick it up and finish login.
//   if (ev.data && ev.data.type === 'SSO_TOKEN') {
//     console.log('[Alfresco] Forwarding SSO_TOKEN to addattachment/dialog iframe', ev.data);
//     try {
//       // Prefer addattachment iframe
//       var addIf = topDoc.querySelector('iframe[src*="/addattachment.html"]');
//       if (addIf && addIf.contentWindow) {
//         addIf.contentWindow.postMessage(ev.data, '*');
//       } else {
//         // Fallback to dialog iframe
//         var dlgIf = topDoc.querySelector('iframe[src*="/dialog.html"]');
//         if (dlgIf && dlgIf.contentWindow) dlgIf.contentWindow.postMessage(ev.data, '*');
//       }
//     } catch (e) {
//       console.warn('[Alfresco] forward SSO_TOKEN failed', e);
//     }
//     return;
//   }
  
//   if (ev.data.type === 'ALFRESCO_DIALOG_CLOSE') {
//     var ov = topDoc.getElementById('alfresco-modal-overlay');
//     if (ov) ov.remove();
//     var ov2 = topDoc.getElementById('alfresco-addattachment-overlay');
//     if (ov2) ov2.remove();
//     var sp = topDoc.getElementById('alfresco-side-panel');
//     if (sp) sp.remove();
//   }
  
//   if (ev.data.type === 'OFFICE_MESSAGE_PARENT') {
//     var msg = ev.data.payload;
//     console.log('[Alfresco] OFFICE_MESSAGE_PARENT received:', msg);
    
//     if (msg === 'closeDialog' || msg === 'success') {
//       var ov2 = topDoc.getElementById('alfresco-modal-overlay');
//       if (ov2) ov2.remove();
//       var ov3 = topDoc.getElementById('alfresco-addattachment-overlay');
//       if (ov3) ov3.remove();
//       var sp2 = topDoc.getElementById('alfresco-side-panel');
//       if (sp2) sp2.remove();
//     }
    
//     // If the add-in iframe reports it completed a login flow, reopen
//     // the originally requested action (stored in pendingActionAfterLogin).
//     if (msg === 'login') {
//       console.log('[Alfresco] Received login completion message from iframe');
//       // Close any existing overlays
//       var ov4 = topDoc.getElementById('alfresco-modal-overlay'); if (ov4) ov4.remove();
//       var ov5 = topDoc.getElementById('alfresco-addattachment-overlay'); if (ov5) ov5.remove();

//       // If we have a pending action, reopen it.
//       if (pendingActionAfterLogin) {
//         console.log('[Alfresco] Reopening pending action after login:', pendingActionAfterLogin);
//         var actionToOpen = pendingActionAfterLogin;
//         // Clear stored pending action
//         pendingActionAfterLogin = null;
//         localStorage.removeItem('pendingActionAfterLogin');

//         setTimeout(function() {
//           if (actionToOpen === 'addattachment') {
//             openAddAttachmentModal();
//           } else {
//             openAlfrescoModal(actionToOpen);
//           }
//         }, 500);
//       }
//     }

//     // Handle successful login for addattachment
//     if (msg === 'addattachment') {
//       console.log('[Alfresco] Login successful, reopening addattachment dialog');
      
//       var existingModal = topDoc.getElementById('alfresco-addattachment-overlay');
//       if (existingModal) existingModal.remove();
//       var sp3 = topDoc.getElementById('alfresco-side-panel');
//       if (sp3) sp3.remove();
      
//       setTimeout(function() {
//         openAddAttachmentModal();
//       }, 500);
//     }
    
//     // Handle other actions (alfrescosave, selectattachment, alfrescoopen)
//     if (msg === 'alfrescosave' || msg === 'selectattachment' || msg === 'alfrescoopen') {
//       console.log('[Alfresco] Login successful, reopening dialog for action:', msg);
      
//       var existingModal = topDoc.getElementById('alfresco-modal-overlay');
//       if (existingModal) existingModal.remove();
//       var sp4 = topDoc.getElementById('alfresco-side-panel');
//       if (sp4) sp4.remove();
      
//       setTimeout(function() {
//         openAlfrescoModal(msg);
//       }, 500);
//     }
//   }
  
// // // ========================================================================
// // // Handle attachment requests from addattachment dialog (browsefiles.tsx)
// // // ========================================================================
// // if (ev.data.type === 'ATTACH_FILE_TO_COMPOSE') {
// //   console.log('[Alfresco] Received attachment request:', ev.data.fileName);
  
// //   // Set attaching flag to prevent observer interference
// //   isAttaching = true;
  
// //   var fileName = ev.data.fileName;
// //   var base64Content = ev.data.base64Content;
// //   var mimeType = ev.data.mimeType;
// //   var messageId = ev.data.messageId;
  
// //   // Send response function
// //   function sendResponse(success, errorMsg) {
// //     if (ev.source) {
// //       ev.source.postMessage({
// //         type: 'ATTACH_FILE_RESPONSE',
// //         success: success,
// //         error: errorMsg,
// //         messageId: messageId
// //       }, '*');
// //     }
// //     // Reset attaching flag after response is sent
// //     setTimeout(function() {
// //       isAttaching = false;
// //     }, 1000);
// //   }
  
// //   try {
// //     // Convert base64 to blob
// //     var byteCharacters = atob(base64Content);
// //     var byteNumbers = new Array(byteCharacters.length);
// //     for (var i = 0; i < byteCharacters.length; i++) {
// //       byteNumbers[i] = byteCharacters.charCodeAt(i);
// //     }
// //     var byteArray = new Uint8Array(byteNumbers);
// //     var blob = new Blob([byteArray], { type: mimeType });
    
// //     // Create a File object
// //     var file = new File([blob], fileName, { type: mimeType });
    
// //     // Method 1: Find compose area and use clipboard API
// //     var composeArea = topDoc.querySelector('[contenteditable="true"], .compose-body, .email-body, .msg-compose-body');
    
// //     if (composeArea) {
// //       console.log('[Alfresco] Found compose area, trying to add attachment via clipboard');
      
// //       // Try to use clipboard API to add file
// //       navigator.clipboard.write([
// //         new ClipboardItem({
// //           [blob.type]: blob
// //         })
// //       ]).then(function() {
// //         console.log('[Alfresco] File copied to clipboard, simulating paste');
        
// //         // Simulate paste event in compose area
// //         var pasteEvent = new ClipboardEvent('paste', {
// //           bubbles: true,
// //           cancelable: true,
// //           clipboardData: new DataTransfer()
// //         });
// //         composeArea.dispatchEvent(pasteEvent);
        
// //         sendResponse(true, null);
// //       }).catch(function(err) {
// //         console.log('[Alfresco] Clipboard API failed, trying alternate method:', err);
// //         attachViaFileInput(file, fileName, sendResponse);
// //       });
      
// //       return;
// //     }
    
// //     // Method 2: Use file input approach
// //     attachViaFileInput(file, fileName, sendResponse);
    
// //   } catch (err) {
// //     console.error('[Alfresco] Error attaching file:', err);
// //     sendResponse(false, err.message);
// //     isAttaching = false;
// //   }
// // }

// // function attachViaFileInput(file, fileName, sendResponse) {
// //   // Create a temporary file input
// //   var tempInput = topDoc.createElement('input');
// //   tempInput.type = 'file';
// //   tempInput.style.display = 'none';
// //   tempInput.style.position = 'absolute';
// //   tempInput.style.top = '-100px';
// //   tempInput.style.left = '-100px';
  
// //   var dataTransfer = new DataTransfer();
// //   dataTransfer.items.add(file);
// //   tempInput.files = dataTransfer.files;
  
// //   tempInput.onchange = function() {
// //     console.log('[Alfresco] File input change triggered');
// //     if (tempInput.files && tempInput.files.length > 0) {
// //       // Dispatch a custom event that Zimbra might listen to
// //       var customEvent = new CustomEvent('attachmentAdded', {
// //         detail: { fileName: fileName, file: tempInput.files[0] }
// //       });
// //       topDoc.dispatchEvent(customEvent);
      
// //       sendResponse(true, null);
// //     }
// //     // Clean up
// //     if (tempInput.parentNode) tempInput.remove();
// //   };
  
// //   topDoc.body.appendChild(tempInput);
  
// //   // Trigger change event
// //   var changeEvent = new Event('change', { bubbles: true });
// //   tempInput.dispatchEvent(changeEvent);
  
// //   // Also trigger input event
// //   var inputEvent = new Event('input', { bubbles: true });
// //   tempInput.dispatchEvent(inputEvent);
  
// //   // Remove after timeout
// //   setTimeout(function() {
// //     if (tempInput.parentNode) {
// //       tempInput.remove();
// //       sendResponse(false, 'Timeout waiting for attachment');
// //     }
// //   }, 10000);
// // }

// // // ========================================================================
// // // Handle attachment requests from addattachment dialog (browsefiles.tsx)
// // // ========================================================================
// // if (ev.data.type === 'ATTACH_FILE_TO_COMPOSE') {
// //   console.log('[Alfresco] Received attachment request:', ev.data.fileName);
  
// //   var fileName = ev.data.fileName;
// //   var base64Content = ev.data.base64Content;
// //   var mimeType = ev.data.mimeType;
// //   var messageId = ev.data.messageId;
  
// //   function sendResponse(success, errorMsg) {
// //     if (ev.source) {
// //       ev.source.postMessage({
// //         type: 'ATTACH_FILE_RESPONSE',
// //         success: success,
// //         error: errorMsg,
// //         messageId: messageId
// //       }, '*');
// //     }
// //   }
  
// //   try {
// //     // Convert base64 to Blob and File
// //     var byteCharacters = atob(base64Content);
// //     var byteNumbers = new Array(byteCharacters.length);
// //     for (var i = 0; i < byteCharacters.length; i++) {
// //       byteNumbers[i] = byteCharacters.charCodeAt(i);
// //     }
// //     var byteArray = new Uint8Array(byteNumbers);
// //     var blob = new Blob([byteArray], { type: mimeType });
// //     var file = new File([blob], fileName, { type: mimeType });
    
// //     // Find Zimbra's native Attach button
// //     var attachButton = topDoc.querySelector('.zimbra-client_composer_actionMenuAttachmentsButton, button[title="Attachments"]');
    
// //     if (attachButton) {
// //       console.log('[Alfresco] Found native Zimbra attach button, clicking it');
      
// //       // Create a hidden file input that will intercept the file picker
// //       var hiddenInput = topDoc.createElement('input');
// //       hiddenInput.type = 'file';
// //       hiddenInput.id = 'alfresco-temp-attachment';
// //       hiddenInput.style.position = 'fixed';
// //       hiddenInput.style.top = '-100px';
// //       hiddenInput.style.left = '-100px';
// //       hiddenInput.style.opacity = '0';
      
// //       // Set the file
// //       var dataTransfer = new DataTransfer();
// //       dataTransfer.items.add(file);
// //       hiddenInput.files = dataTransfer.files;
      
// //       // When the hidden input gets the file, simulate it being selected via Zimbra's picker
// //       hiddenInput.addEventListener('change', function(e) {
// //         console.log('[Alfresco] Hidden input change triggered');
// //         if (hiddenInput.files && hiddenInput.files.length > 0) {
// //           // Look for Zimbra's actual file input that appears after clicking Attach
// //           setTimeout(function() {
// //             var zimbraFileInput = topDoc.querySelector('input[type="file"]:not(#alfresco-temp-attachment)');
// //             if (zimbraFileInput) {
// //               console.log('[Alfresco] Found Zimbra file input, transferring file');
// //               var dt = new DataTransfer();
// //               dt.items.add(file);
// //               zimbraFileInput.files = dt.files;
              
// //               var changeEvent = new Event('change', { bubbles: true });
// //               zimbraFileInput.dispatchEvent(changeEvent);
              
// //               sendResponse(true, null);
// //             } else {
// //               // Fallback: The file might be attached via the hidden input itself
// //               console.log('[Alfresco] No Zimbra file input found, file ready in hidden input');
// //               sendResponse(true, null);
// //             }
// //             hiddenInput.remove();
// //           }, 500);
// //         }
// //       });
      
// //       topDoc.body.appendChild(hiddenInput);
      
// //       // Click the hidden input to trigger file selection (this will use our pre-set file)
// //       hiddenInput.click();
      
// //       // Also click the native attach button to open Zimbra's attachment UI
// //       attachButton.click();
      
// //       // Clean up after timeout
// //       setTimeout(function() {
// //         if (hiddenInput && hiddenInput.parentNode) {
// //           hiddenInput.remove();
// //         }
// //       }, 10000);
      
// //     } else {
// //       // Fallback: Use file download
// //       console.log('[Alfresco] No attach button found, downloading file');
// //       var url = URL.createObjectURL(blob);
// //       var a = document.createElement('a');
// //       a.href = url;
// //       a.download = fileName;
// //       a.click();
// //       URL.revokeObjectURL(url);
// //       sendResponse(true, 'File downloaded. Please click the paperclip icon to attach.');
// //     }
    
// //   } catch (err) {
// //     console.error('[Alfresco] Error attaching file:', err);
// //     sendResponse(false, err.message);
// //   }
// // }

// // ========================================================================
// // Handle attachment requests from addattachment dialog (browsefiles.tsx)
// // ========================================================================
// if (ev.data.type === 'ATTACH_FILE_TO_COMPOSE') {
//   console.log('[Alfresco] Received attachment request:', ev.data.fileName);
  
//   var fileName = ev.data.fileName;
//   var base64Content = ev.data.base64Content;
//   var mimeType = ev.data.mimeType;
//   var messageId = ev.data.messageId;
  
//   function sendResponse(success, errorMsg) {
//     if (ev.source) {
//       ev.source.postMessage({
//         type: 'ATTACH_FILE_RESPONSE',
//         success: success,
//         error: errorMsg,
//         messageId: messageId
//       }, '*');
//     }
//   }
  
//   try {
//     // Convert base64 to Blob
//     var byteCharacters = atob(base64Content);
//     var byteNumbers = new Array(byteCharacters.length);
//     for (var i = 0; i < byteCharacters.length; i++) {
//       byteNumbers[i] = byteCharacters.charCodeAt(i);
//     }
//     var byteArray = new Uint8Array(byteNumbers);
//     var blob = new Blob([byteArray], { type: mimeType });
    
//     // Create download link and trigger download
//     var url = URL.createObjectURL(blob);
//     var downloadLink = topDoc.createElement('a');
//     downloadLink.href = url;
//     downloadLink.download = fileName;
//     downloadLink.style.display = 'none';
//     topDoc.body.appendChild(downloadLink);
//     downloadLink.click();
    
//     // Clean up
//     setTimeout(function() {
//       URL.revokeObjectURL(url);
//       if (downloadLink.parentNode) downloadLink.remove();
//     }, 100);
    
//     console.log('[Alfresco] File downloaded:', fileName);
//     sendResponse(true, null);
    
//   } catch (err) {
//     console.error('[Alfresco] Error downloading file:', err);
//     sendResponse(false, err.message);
//   }
// }
// });

// console.log('[Alfresco] Ready!');
// if (typeof zimlet === 'function') {
//   function AlfrescoZimletHandler() {}
//   AlfrescoZimletHandler.prototype.init = function() { console.log('[Alfresco] SDK init()'); };
//   zimlet(AlfrescoZimletHandler);
// }