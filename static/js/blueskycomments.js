// URL normalization: strip protocol, www., trailing slash, lowercase
function normalizeUrl(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// Search the author's feed for posts linking to pageUrl.
// Returns an array of AT URIs.
async function findBlueskyPostByUrl(blueskyUser, pageUrl) {
  const normalizedPage = normalizeUrl(pageUrl);
  const matchingUris = [];
  let cursor = undefined;
  const maxPages = 3;

  for (let page = 0; page < maxPages; page++) {
    let url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(blueskyUser)}&filter=posts_no_replies&limit=100`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const response = await fetch(url);
    if (!response.ok) break;

    const data = await response.json();
    const feed = data.feed || [];

    for (const item of feed) {
      const post = item.post;

      // Check embed (external link card)
      if (
        post.embed &&
        post.embed.$type === "app.bsky.embed.external#view" &&
        post.embed.external &&
        post.embed.external.uri
      ) {
        if (normalizeUrl(post.embed.external.uri) === normalizedPage) {
          matchingUris.push(post.uri);
          continue;
        }
      }

      // Fallback: check link facets in post text
      const facets = post.record && post.record.facets ? post.record.facets : [];
      for (const facet of facets) {
        for (const feature of facet.features || []) {
          if (
            feature.$type === "app.bsky.richtext.facet#link" &&
            normalizeUrl(feature.uri) === normalizedPage
          ) {
            matchingUris.push(post.uri);
            break;
          }
        }
        if (matchingUris[matchingUris.length - 1] === post.uri) break;
      }
    }

    cursor = data.cursor;
    if (!cursor || feed.length === 0) break;
  }

  return matchingUris;
}

// Fetch a thread by AT URI and return the thread data
async function fetchThread(uri) {
  const response = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=10`
  );
  if (!response.ok) throw new Error(`Failed to fetch thread: ${response.status}`);
  return response.json();
}

// Extract the rkey (last segment) from an AT URI
function getRkey(uri) {
  return uri.split("/").pop();
}

// Render a list of replies into a parent DOM element
function renderComments(comments, parentElement, moderation) {
  moderation = moderation || { blockedUsers: [], blockedPosts: [] };
  if (comments.length === 0) {
    parentElement.innerHTML = "<p>No comments yet.</p>";
    return;
  }
  comments.forEach((reply) => {
    if (reply.blocked) return;

    // Moderation: skip blocked users and blocked posts (including subtree)
    if (moderation.blockedUsers.length > 0 && moderation.blockedUsers.includes(reply.post.author.did)) return;
    if (moderation.blockedPosts.length > 0 && moderation.blockedPosts.includes(getRkey(reply.post.uri))) return;

    const author = reply.post.author;
    let content = reply.post.record.text;
    const createdAt = new Date(reply.post.record.createdAt).toLocaleString();

    const replyCount = Number(reply.post.replyCount) || 0;
    const repostCount = Number(reply.post.repostCount) || 0;
    const likeCount = Number(reply.post.likeCount) || 0;

    // Process facets to embed links and mentions
    const facets = reply.post.record.facets || [];
    facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

    let offset = 0;
    facets.forEach((facet) => {
      const start = facet.index.byteStart + offset;
      const end = facet.index.byteEnd + offset;
      const originalText = content.slice(start, end);
      let replacementText = originalText;

      facet.features.forEach((feature) => {
        if (feature.$type === "app.bsky.richtext.facet#link") {
          replacementText = `<a class="link" href="${feature.uri}" target="_blank" rel="noopener noreferrer">${originalText}</a>`;
        } else if (feature.$type === "app.bsky.richtext.facet#mention") {
          replacementText = `<a class="link" href="https://bsky.app/profile/${feature.did}" target="_blank" rel="noopener noreferrer">${originalText}</a>`;
        }
      });

      content = content.slice(0, start) + replacementText + content.slice(end);
      offset += replacementText.length - originalText.length;
    });

    const safeContent = DOMPurify.sanitize(content);

    const commentHtml = `
        <div class="comment-container">
            <img src="${author.avatar}" alt="${author.displayName}'s avatar" class="comment-avatar">
            <div class="comment-details">
                <div class="comment-header">
                    <a href="https://bsky.app/profile/${author.did}" target="_blank" class="username-link">${author.displayName}</a>
                    <span class="comment-handle">@${author.handle}</span>
                </div>
                <div class="comment-text">${safeContent}</div>
                <div class="comment-timestamp">${createdAt}</div>
                    <div class="comment-meta">
                        <!-- Comment Icon and Count -->
                        <span class="meta-item">
                            <svg class="icon icon-comment" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M12 2C6.48 2 2 5.58 2 10c0 2.5 1.64 4.71 4.11 6.13L5 21l5.11-2.11c.61.08 1.24.11 1.89.11 5.52 0 10-3.58 10-8s-4.48-8-10-8zm0 14c-.55 0-1.1-.05-1.64-.14l-.36-.07-3.09 1.27.64-2.73-.24-.14C5.14 13.88 4 12.03 4 10c0-3.31 3.58-6 8-6s8 2.69 8 6-3.58 6-8 6z"/>
                            </svg>
                            <span class="icon-text">${replyCount}</span>
                        </span>

                        <!-- Reshare Icon and Count -->
                        <span class="meta-item">
                            <svg class="icon icon-reshare" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m13.5 13.5 3 3 3-3"/>
                                <path d="M9.5 4.5h3a4 4 0 0 1 4 4v8m-9-9-3-3-3 3"/>
                                <path d="M11.5 16.5h-3a4 4 0 0 1-4-4v-8"/>
                            </svg>
                            <span class="icon-text">${repostCount}</span>
                        </span>

                        <!-- Like Icon and Count -->
                        <span class="meta-item">
                            <svg class="icon icon-like" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3 9.24 3 10.91 3.81 12 5.09 13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                            <span class="icon-text">${likeCount}</span>
                        </span>
                    </div>
                </div>
        </div>
    `;

    const commentElement = document.createElement("div");
    commentElement.classList.add("comment");
    commentElement.innerHTML = commentHtml;
    parentElement.appendChild(commentElement);

    // Render child comments recursively
    if (reply.replies && reply.replies.length > 0) {
      const childContainer = document.createElement("div");
      childContainer.classList.add("child-comments");
      commentElement.appendChild(childContainer);
      renderComments(reply.replies, childContainer, moderation);
    }
  });
}

// Convert an AT URI to a Bluesky web URL
function atUriToWebUrl(atUri) {
  // at://did:plc:xxx/app.bsky.feed.post/yyy -> https://bsky.app/profile/did:plc:xxx/post/yyy
  const parts = atUri.replace("at://", "").split("/");
  const did = parts[0];
  const rkey = parts[2];
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

// Load and render a single thread into a container element
async function loadThread(uri, container, moderation) {
  const data = await fetchThread(uri);
  const replies = data.thread.replies || [];
  replies.sort(sortByLike);
  renderComments(replies, container, moderation);
}

// Original entry point: load comments by a known post ID (backward compatible)
function loadBlueskyComments(blueskyUser, commentId, moderation) {
  document.addEventListener("DOMContentLoaded", function () {
    const commentList = document.getElementById("bluesky-comments-list");
    commentList.innerHTML = "Loading comments...";

    const uri = `at://${blueskyUser}/app.bsky.feed.post/${commentId}`;
    loadThread(uri, commentList, moderation).catch((error) => {
      console.error("Error fetching comments:", error);
      commentList.innerHTML = "<p>Error loading comments.</p>";
    });
  });
}

// New entry point: auto-discover posts linking to pageUrl, then load all threads
function loadBlueskyCommentsByUrl(blueskyUser, pageUrl, moderation) {
  document.addEventListener("DOMContentLoaded", async function () {
    const commentList = document.getElementById("bluesky-comments-list");
    const replyLink = document.getElementById("bluesky-reply-link");
    commentList.innerHTML = "Searching for comments...";

    try {
      const uris = await findBlueskyPostByUrl(blueskyUser, pageUrl);

      if (uris.length === 0) {
        commentList.innerHTML = "<p>No comments yet. No Bluesky post was found for this article.</p>";
        if (replyLink) replyLink.style.display = "none";
        return;
      }

      commentList.innerHTML = "";

      // If there's a single post, set the reply link and load directly
      if (uris.length === 1) {
        const webUrl = atUriToWebUrl(uris[0]);
        if (replyLink) {
          replyLink.href = webUrl;
          replyLink.style.display = "";
        }
        await loadThread(uris[0], commentList, moderation);
        return;
      }

      // Multiple matching posts: render each as a separate section
      if (replyLink) replyLink.style.display = "none";
      for (const uri of uris) {
        const webUrl = atUriToWebUrl(uri);

        const section = document.createElement("div");
        section.classList.add("bluesky-thread-section");

        const header = document.createElement("p");
        header.classList.add("comment-intro");
        header.innerHTML = `<a class="button-link" href="${webUrl}" target="_blank">Reply on Bluesky</a>`;
        section.appendChild(header);

        const threadContainer = document.createElement("div");
        section.appendChild(threadContainer);
        commentList.appendChild(section);

        await loadThread(uri, threadContainer, moderation);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      commentList.innerHTML = "<p>Error loading comments.</p>";
    }
  });
}

function sortByLike(a, b) {
  return b.post.likeCount - a.post.likeCount;
}

function sortByDate(a, b) {
  return new Date(a.post.record.createdAt) - new Date(b.post.record.createdAt);
}
