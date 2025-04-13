const puppeteer = require('puppeteer');
const logger = require('../../shared/utils/logger'); // Assuming logger path

const exportToPdf = async (req, res) => {
    const { htmlContent, themeName = 'light' } = req.body;

    if (!htmlContent) {
        return res.status(400).json({ message: 'Missing htmlContent in request body' });
    }

    let browser = null;
    try {
        logger.info('Launching Puppeteer browser for PDF export...');
        // Launch Puppeteer - add sandbox args for compatibility in some environments
        browser = await puppeteer.launch({
             headless: true,
             args: [
                 '--no-sandbox',
                 '--disable-setuid-sandbox',
                 '--disable-dev-shm-usage', // Often needed in docker/CI
                 '--disable-accelerated-2d-canvas',
                 '--no-first-run',
                 '--no-zygote',
                 // '--single-process', // May help on some systems, but can be less stable
                 '--disable-gpu'
             ]
         });
        const page = await browser.newPage();

        logger.info('Setting page content...');
        // Use waitUntil: 'networkidle0' to wait for potential resources (like images if URLs were present) to load
        // This might not be strictly necessary if all content is inline, but safer.
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        // --- Style Injection (Basic Example - Needs Adaptation) ---
        // This is the trickiest part. We need to replicate the visual appearance.
        // Option 1: Inject link to your main compiled CSS (if accessible via URL)
        // Example: await page.addStyleTag({ url: 'http://localhost:YOUR_BACKEND_PORT/path/to/your/main.css' });

        // Option 2: Inject specific Tailwind classes or inline styles based on theme
        await page.evaluate((theme) => {
            document.body.classList.add(theme);
            // Potentially add other base styles needed for layout
            document.body.style.margin = '0'; // Example reset
         }, themeName);

        // Add a small delay to ensure styles are applied (sometimes needed)
        await new Promise(resolve => setTimeout(resolve, 100));

        logger.info('Generating PDF...');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true, // Crucial for capturing background colors/images
            margin: {
                top: '15mm',
                right: '10mm',
                bottom: '15mm',
                left: '10mm'
            }
        });

        logger.info('PDF generated successfully.');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
        res.send(pdfBuffer);

    } catch (error) {
        logger.error('Error during PDF export:', error);
        res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
    } finally {
        if (browser) {
            logger.info('Closing Puppeteer browser.');
            await browser.close();
        }
    }
};

module.exports = {
    exportToPdf,
}; 