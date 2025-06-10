xpi: clean
	zip -X -x /*.code-workspace makefile information.txt README.adoc -r regimailAddOn.xpi *

clean:
	rm -f regimailAddOn.xpi
