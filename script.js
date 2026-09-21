(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sticky-hero scroll fade: hero content fades and drifts up as user scrolls,
  // while the next section rises over the sticky hero.
  const hero = document.querySelector('.hero');
  const heroFadeEls = hero ? hero.querySelectorAll('.hero-copy, .hero-art') : [];
  if (hero && heroFadeEls.length && !reduce) {
    let ticking = false;
    const update = () => {
      const rect = hero.getBoundingClientRect();
      // progress: 0 while hero fully in view, 1 by the time bottom of hero is at top of viewport
      const range = Math.max(1, rect.height);
      const scrolled = Math.max(0, -rect.top);
      const p = Math.max(0, Math.min(1, scrolled / (range * 0.75)));
      const eased = p * p * (3 - 2 * p); // smoothstep
      const opacity = 1 - eased;
      const translate = -eased * 40;
      const scale = 1 - eased * 0.04;
      heroFadeEls.forEach((el) => {
        el.style.opacity = opacity.toFixed(3);
        el.style.transform = `translateY(${translate.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      });
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  // Reveal-on-scroll: any element with .reveal or .reveal-stagger animates in once
  const targets = document.querySelectorAll('.reveal, .reveal-stagger');
  if ('IntersectionObserver' in window && targets.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => io.observe(el));
  } else {
    targets.forEach((el) => el.classList.add('is-visible'));
  }

  // Top nav dropdowns — pure CSS hover; sync aria-expanded on mouseover/focus
  document.querySelectorAll('.site-nav .nav-item.has-dropdown').forEach((item) => {
    const trigger = item.querySelector('.nav-link');
    if (!trigger) return;
    const setExpanded = (v) => trigger.setAttribute('aria-expanded', v ? 'true' : 'false');
    item.addEventListener('mouseenter', () => setExpanded(true));
    item.addEventListener('mouseleave', () => setExpanded(false));
    item.addEventListener('focusin', () => setExpanded(true));
    item.addEventListener('focusout', () => setExpanded(false));
  });

  // Mobile menu
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuClose = document.querySelector('.mobile-menu-close');
  if (menuToggle && mobileMenu) {
    const openMenu = () => {
      mobileMenu.classList.add('is-open');
      mobileMenu.setAttribute('aria-hidden', 'false');
      menuToggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
    };
    const closeMenu = () => {
      mobileMenu.classList.remove('is-open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      menuToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      // Also collapse any expanded submenus
      mobileMenu.querySelectorAll('.mm-has-sub.is-open').forEach((sub) => {
        sub.classList.remove('is-open');
        const btn = sub.querySelector('.mm-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    };
    menuToggle.addEventListener('click', openMenu);
    if (menuClose) menuClose.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) closeMenu();
    });
    // Close when tapping a leaf link in the mobile menu
    mobileMenu.querySelectorAll('a[href]').forEach((a) => {
      a.addEventListener('click', () => { closeMenu(); });
    });

    // Expandable Solutions / Insights / About
    mobileMenu.querySelectorAll('.mm-has-sub .mm-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.mm-has-sub');
        const isOpen = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });
  }

  // Solutions carousel — organic focal-point with cursor tracking + infinite loop
  const track = document.querySelector('[data-carousel]');
  if (track) {
    // Duplicate the card set twice (3 identical sets total) so the user can scroll
    // in either direction endlessly. We invisibly teleport by one set-width once
    // the user drifts too far into an outer set — the visual is identical so it's seamless.
    const originals = Array.from(track.querySelectorAll('.sol-card'));
    const cloneA = originals.map((c) => c.cloneNode(true));
    const cloneB = originals.map((c) => c.cloneNode(true));
    cloneA.forEach((c) => track.appendChild(c));
    cloneB.forEach((c) => track.appendChild(c));
    const cards = Array.from(track.querySelectorAll('.sol-card'));

    const getSetWidth = () => {
      if (!originals[0] || !cloneA[0]) return 0;
      return cloneA[0].getBoundingClientRect().left - originals[0].getBoundingClientRect().left;
    };

    // Keeps user inside the middle set. Returns the applied delta (0 if no wrap).
    const maybeWrap = () => {
      const setW = getSetWidth();
      if (setW <= 0) return 0;
      let delta = 0;
      if (track.scrollLeft < setW * 0.5) delta = setW;
      else if (track.scrollLeft >= setW * 2.5) delta = -setW;
      if (delta) track.scrollLeft += delta;
      return delta;
    };

    // Focal x-position in track coordinate space. Animates smoothly toward targetFocalX.
    let focalX = 0;
    let targetFocalX = 0;
    let cursorInside = false;

    const trackCenterX = () => {
      const r = track.getBoundingClientRect();
      return r.left + r.width / 2;
    };

    const cardCenterX = (card) => {
      const r = card.getBoundingClientRect();
      return r.left + r.width / 2;
    };

    // Bell-curve falloff: 1 at zero distance, ~0 by ~1.8 card widths away.
    const focusStrength = (distPx, cardWidth) => {
      const d = distPx / (cardWidth * 1.15);
      return Math.max(0, Math.min(1, Math.exp(-d * d * 1.4)));
    };

    const paint = () => {
      // Smoothly lerp focal toward target
      focalX += (targetFocalX - focalX) * 0.18;
      const cw = cards[0] ? cards[0].getBoundingClientRect().width : 300;

      cards.forEach((c) => {
        const dist = Math.abs(cardCenterX(c) - focalX);
        const f = focusStrength(dist, cw);
        const s = 0.86 + f * 0.16;   // 0.86 → 1.02 range for depth
        const o = 0.7 + f * 0.3;
        c.style.setProperty('--s', s.toFixed(3));
        c.style.setProperty('--o', o.toFixed(3));
        c.style.setProperty('--focus', f.toFixed(3));
        c.style.zIndex = String(Math.round(f * 10));
      });

      if (Math.abs(targetFocalX - focalX) > 0.4 || cursorInside) {
        requestAnimationFrame(paint);
      }
    };

    const setTarget = (x) => {
      targetFocalX = x;
      requestAnimationFrame(paint);
    };

    // Default target: nearest scroll center (or exact center)
    const recomputeIdleTarget = () => {
      if (cursorInside) return;
      setTarget(trackCenterX());
    };

    track.addEventListener('mousemove', (e) => {
      cursorInside = true;
      setTarget(e.clientX);
    });
    track.addEventListener('mouseleave', () => {
      cursorInside = false;
      recomputeIdleTarget();
    });

    let scrollTicking = false;
    track.addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        maybeWrap();
        recomputeIdleTarget();
        scrollTicking = false;
      });
    }, { passive: true });
    window.addEventListener('resize', recomputeIdleTarget);

    const scrollByCard = (dir) => {
      const step = (cards[0] ? cards[0].getBoundingClientRect().width : 300) + 10;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    };
    document.querySelectorAll('[data-scroll]').forEach((btn) => {
      btn.addEventListener('click', () => scrollByCard(btn.dataset.scroll === 'next' ? 1 : -1));
    });

    // Pointer drag (works for mouse and touch via Pointer Events)
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = 0;

    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      moved = 0;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.setPointerCapture(e.pointerId);
      track.classList.add('is-dragging');
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.abs(dx);
      track.scrollLeft = startScroll - dx;
      const wrap = maybeWrap();
      if (wrap) startScroll += wrap;
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
      try { track.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    // Prevent accidental card clicks/links after a drag
    track.addEventListener('click', (e) => {
      if (moved > 5) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // Center on middle card and prime the focal
    requestAnimationFrame(() => {
      const mid = cards[Math.floor(cards.length / 2)];
      if (mid) {
        const delta = cardCenterX(mid) - trackCenterX();
        track.scrollLeft += delta;
      }
      focalX = trackCenterX();
      targetFocalX = focalX;
      paint();
    });
  }

  // Cursor spotlight + subtle 3D tilt on case-study cards
  if (!reduce) {
    document.querySelectorAll('.cs-card').forEach((card) => {
      const onMove = (e) => {
        const r = card.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 100;
        const my = ((e.clientY - r.top) / r.height) * 100;
        card.style.setProperty('--mx', mx + '%');
        card.style.setProperty('--my', my + '%');
        const tiltX = ((my - 50) / 50) * -3;
        const tiltY = ((mx - 50) / 50) *  3;
        card.style.setProperty('--tiltX', tiltX + 'deg');
        card.style.setProperty('--tiltY', tiltY + 'deg');
      };
      const reset = () => {
        card.style.setProperty('--tiltX', '0deg');
        card.style.setProperty('--tiltY', '0deg');
      };
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', reset);
    });
  }
})();
