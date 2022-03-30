xpi: clean
	zip -x /*.code-workspace  makefile information.txt README.adoc -r regimailAddOn.xpi *

clean:
	rm -f regimailAddOn.xpi
