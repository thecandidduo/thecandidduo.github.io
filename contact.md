---
title: "Work With Us"
eyebrow: "Let's Talk"
lead: "Brand collaborations, tourism boards, or a simple hello — we'd love to hear from you."
description: "Work with The Candid Duo — collaborations, partnerships and press. Get in touch."
layout: "page"
permalink: "/contact/"
---

## Say hello

Drop us a line at **[{{ site.social.email }}](mailto:{{ site.social.email }})**, or use the form below.

<form class="form" id="contact-form">
  <label for="name">Your name</label>
  <input type="text" id="name" name="name" required>

  <label for="email">Your email</label>
  <input type="email" id="email" name="email" required>

  <label for="message">Message</label>
  <textarea id="message" name="message" placeholder="Tell us about your project…" required></textarea>

  <button class="btn btn--accent" type="submit">Send message</button>
</form>

<p style="text-align:center;color:var(--muted);font-size:.9rem;margin-top:1.5rem">
This opens your email app with the message pre-filled, addressed to <strong>{{ site.social.email }}</strong> — nothing is sent from this page directly.
</p>

<script>
  document.getElementById("contact-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("name").value.trim();
    var email = document.getElementById("email").value.trim();
    var message = document.getElementById("message").value.trim();
    var subject = "New message from " + name + " via thecandidduo.com";
    var body = message + "\n\n—\n" + name + " (" + email + ")";
    window.location.href = "mailto:{{ site.social.email }}?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  });
</script>
