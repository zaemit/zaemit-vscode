// ===== Zaemit Landing Page - Interactive Scripts =====

document.addEventListener('DOMContentLoaded', () => {

    // ===== Scroll-triggered animations =====
    const animatedElements = document.querySelectorAll('[data-animate]');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = entry.target.dataset.delay || 0;
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, delay * 1000);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    animatedElements.forEach(el => observer.observe(el));

    // ===== Navbar scroll effect =====
    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        lastScroll = currentScroll;
    }, { passive: true });

    // ===== Counter animation =====
    const counters = document.querySelectorAll('[data-count]');

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.count);
                animateCounter(el, target);
                counterObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(el => counterObserver.observe(el));

    function animateCounter(el, target) {
        const duration = 2000;
        const start = performance.now();
        const format = target >= 1000;

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * target);

            if (format) {
                el.textContent = current.toLocaleString() + '+';
            } else {
                el.textContent = current + '+';
            }

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    // ===== Smooth scroll for anchor links =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const targetId = anchor.getAttribute('href');
            if (targetId === '#') return;

            const targetEl = document.querySelector(targetId);
            if (targetEl) {
                e.preventDefault();
                const navHeight = navbar.offsetHeight;
                const targetPos = targetEl.getBoundingClientRect().top + window.scrollY - navHeight - 20;
                window.scrollTo({ top: targetPos, behavior: 'smooth' });
            }
        });
    });

    // ===== Tilt effect on editor mockup =====
    const mockup = document.querySelector('.editor-mockup');
    if (mockup) {
        const heroVisual = document.querySelector('.hero-visual');

        heroVisual.addEventListener('mousemove', (e) => {
            const rect = heroVisual.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;

            mockup.style.transform = `rotateX(${-y * 8}deg) rotateY(${x * 8}deg)`;
        });

        heroVisual.addEventListener('mouseleave', () => {
            mockup.style.transform = 'rotateX(2deg)';
        });
    }

    // ===== Typing effect in editor code =====
    const codeLines = document.querySelectorAll('.code-line');
    if (codeLines.length > 0) {
        codeLines.forEach((line, i) => {
            line.style.opacity = '0';
            line.style.transform = 'translateX(-10px)';
            setTimeout(() => {
                line.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                line.style.opacity = '1';
                line.style.transform = 'translateX(0)';
            }, 800 + i * 150);
        });
    }

    // ===== Parallax on hero orbs =====
    const orbs = document.querySelectorAll('.hero-orb');

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        orbs.forEach((orb, i) => {
            const speed = (i + 1) * 0.15;
            orb.style.transform = `translateY(${scrollY * speed}px)`;
        });
    }, { passive: true });

    // ===== Feature card hover glow =====
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--glow-x', `${x}px`);
            card.style.setProperty('--glow-y', `${y}px`);
        });
    });

});
