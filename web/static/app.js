// STT Final Summary - Beautiful Dashboard JavaScript

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎨 STT Dashboard loaded');
    initializeEventHandlers();
    setupScrollAnimations();
});

/**
 * Initialize all event handlers
 */
function initializeEventHandlers() {
    // Copy command buttons
    const copyButtons = document.querySelectorAll('.action-btn');
    copyButtons.forEach(btn => {
        btn.addEventListener('click', handleCopyCommand);
    });

    // Documentation links
    const docLinks = document.querySelectorAll('.doc-link');
    docLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            console.log('Opening:', link.href);
        });
    });

    // Model cards - add hover effects
    const modelCards = document.querySelectorAll('.model-card');
    modelCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.animation = 'none';
            setTimeout(() => {
                card.style.animation = '';
            }, 10);
        });
    });

    // Stat cards - add interactive feel
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.addEventListener('click', () => {
            showNotification('Card clicked!', 'info');
        });
    });

    console.log('✅ Event handlers initialized');
}

/**
 * Handle copy-to-clipboard for command buttons
 */
function handleCopyCommand(e) {
    const button = e.currentTarget;
    
    // Extract command - look for the data-command attribute or text content
    let command = button.getAttribute('data-command');
    
    if (!command) {
        // Fallback: extract from inner text
        const cmdMatch = button.textContent.match(/python run\.py \w+/);
        command = cmdMatch ? cmdMatch[0] : button.textContent;
    }

    if (!command) {
        return;
    }

    // Copy to clipboard
    navigator.clipboard.writeText(command).then(() => {
        // Show feedback
        showCopyNotification(command);
        
        // Button visual feedback
        const originalText = button.innerHTML;
        button.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">Copied!</span>';
        button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        button.style.borderColor = '#10b981';
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.background = '';
            button.style.borderColor = '';
        }, 2000);
        
        console.log('Copied to clipboard:', command);
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy command', 'error');
    });
}

/**
 * Show copy notification
 */
function showCopyNotification(command) {
    const notification = document.getElementById('copy-notification');
    
    if (notification) {
        notification.classList.add('show');
        notification.querySelector('.notification-text').textContent = 
            `Copied: ${command}`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

/**
 * General notification system
 */
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

/**
 * Setup scroll animations
 */
function setupScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0px)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all cards
    document.querySelectorAll('.card, .stat-card, .doc-link').forEach(element => {
        element.style.opacity = '0.7';
        element.style.transform = 'translateY(10px)';
        element.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        observer.observe(element);
    });
}

/**
 * Open documentation link
 */
function openLink(url) {
    window.open(url, '_blank');
}

/**
 * Copy function for backward compatibility
 */
function copyCommand(command) {
    navigator.clipboard.writeText(command).then(() => {
        showCopyNotification(command);
        console.log('Copied:', command);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

console.log('🎨 STT Beautiful Dashboard ready!');
